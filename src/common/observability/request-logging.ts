import { randomUUID } from 'crypto';
import type { NextFunction, Request, Response } from 'express';

/** Identificador aceito do cliente/proxy: só caracteres seguros, para não poluir logs. */
const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{8,64}$/;

export type RequestWithId = Request & { requestId?: string; user?: { id?: string; empresaId?: string } };

export function resolveRequestId(incoming: string | undefined): string {
  const value = incoming?.trim();
  return value && SAFE_REQUEST_ID.test(value) ? value : randomUUID();
}

export interface LogEntry {
  level: 'info' | 'warn' | 'error';
  msg: string;
  [key: string]: unknown;
}

/** Uma linha JSON por evento (fácil de coletar em qualquer agregador de logs). */
export function writeLog(entry: LogEntry) {
  const line = JSON.stringify({ ts: new Date().toISOString(), ...entry });
  if (entry.level === 'error') process.stderr.write(`${line}\n`);
  else process.stdout.write(`${line}\n`);
}

/**
 * Define o X-Request-Id (o "código de suporte" mostrado ao usuário) e registra cada requisição:
 * método, rota sem query string (evita dados pessoais de busca), status, duração, empresa e usuário.
 */
export function requestLoggingMiddleware(options: { enabled: boolean }) {
  return (req: RequestWithId, res: Response, next: NextFunction) => {
    const requestId = resolveRequestId(req.header('x-request-id'));
    req.requestId = requestId;
    res.setHeader('X-Request-Id', requestId);
    if (!options.enabled) {
      next();
      return;
    }
    const startedAt = process.hrtime.bigint();
    res.on('finish', () => {
      const status = res.statusCode;
      if (req.path.startsWith('/health')) return;
      writeLog({
        level: status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info',
        msg: 'http_request',
        requestId,
        method: req.method,
        path: req.path,
        status,
        durationMs: Number((process.hrtime.bigint() - startedAt) / 1_000_000n),
        empresaId: req.user?.empresaId,
        userId: req.user?.id,
      });
    });
    next();
  };
}
