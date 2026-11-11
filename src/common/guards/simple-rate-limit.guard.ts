import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { InjectConnection } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import { RATE_LIMIT_KEY, RateLimitOptions } from '../decorators/rate-limit.decorator';
import { writeLog } from '../observability/request-logging';

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

type RateLimitDoc = { _id: string; count: number; expiresAt: Date };

const TOO_MANY = 'Muitas tentativas. Aguarde um momento e tente novamente.';
const COLLECTION = 'rateLimits';

/**
 * Limite de tentativas por rota e IP.
 * - Padrão: memória do processo (suficiente com uma única réplica da API).
 * - RATE_LIMIT_STORE=mongo: contador compartilhado no MongoDB, para várias réplicas
 *   (janela fixa, incremento atômico e expiração automática por índice TTL).
 *   Se o banco falhar, usa a memória para não bloquear o login.
 */
@Injectable()
export class SimpleRateLimitGuard implements CanActivate {
  private readonly hits = new Map<string, RateLimitEntry>();
  private ttlIndexReady: Promise<unknown> | null = null;

  constructor(
    private readonly reflector: Reflector,
    @Optional() private readonly config?: ConfigService,
    @Optional() @InjectConnection() private readonly connection?: Connection,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const options = this.reflector.getAllAndOverride<RateLimitOptions | undefined>(
      RATE_LIMIT_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!options) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{
      ip?: string;
      headers: Record<string, string | string[] | undefined>;
      originalUrl?: string;
      route?: { path?: string };
    }>();
    const key = this.getKey(request, options);
    const count = this.usesSharedStore()
      ? await this.incrementShared(key, options).catch((error: unknown) => {
        writeLog({ level: 'warn', msg: 'rate_limit_store_unavailable', error: (error as Error)?.message });
        return this.incrementMemory(key, options);
      })
      : this.incrementMemory(key, options);

    if (count > options.limit) {
      throw new HttpException(TOO_MANY, HttpStatus.TOO_MANY_REQUESTS);
    }

    return true;
  }

  private usesSharedStore() {
    return this.config?.get<string>('RATE_LIMIT_STORE') === 'mongo' && Boolean(this.connection?.db);
  }

  private incrementMemory(key: string, options: RateLimitOptions) {
    const now = Date.now();
    const current = this.hits.get(key);

    if (!current || current.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + options.windowMs });
      this.cleanup(now);
      return 1;
    }

    current.count += 1;
    return current.count;
  }

  private async incrementShared(key: string, options: RateLimitOptions) {
    const collection = this.connection!.db!.collection<RateLimitDoc>(COLLECTION);
    this.ttlIndexReady ??= collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }).catch(() => undefined);
    await this.ttlIndexReady;
    const windowStart = Math.floor(Date.now() / options.windowMs) * options.windowMs;
    const result = await collection.findOneAndUpdate(
      { _id: `${key}:${windowStart}` },
      { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date(windowStart + options.windowMs) } },
      { upsert: true, returnDocument: 'after' },
    );
    return result?.count ?? 1;
  }

  private getKey(
    request: { ip?: string; headers: Record<string, string | string[] | undefined>; originalUrl?: string; route?: { path?: string } },
    options: RateLimitOptions,
  ) {
    const ip = request.ip || 'unknown';
    const route = request.route?.path || request.originalUrl || 'route';

    return `${options.keyPrefix || route}:${ip}`;
  }

  private cleanup(now: number) {
    if (this.hits.size < 1000) {
      return;
    }

    for (const [key, entry] of this.hits.entries()) {
      if (entry.resetAt <= now) {
        this.hits.delete(key);
      }
    }
  }
}
