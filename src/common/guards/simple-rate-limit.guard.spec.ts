import { HttpException } from '@nestjs/common';
import { SimpleRateLimitGuard } from './simple-rate-limit.guard';

const options = { limit: 2, windowMs: 60_000, keyPrefix: 'auth-login' };
const reflector = { getAllAndOverride: () => options } as never;
const context = (ip = '10.0.0.1') => ({
  getHandler: () => undefined,
  getClass: () => undefined,
  switchToHttp: () => ({ getRequest: () => ({ ip, headers: {} }) }),
}) as never;

/** Coleção falsa que imita findOneAndUpdate com $inc/upsert, compartilhada entre "réplicas". */
const sharedCollection = () => {
  const docs = new Map<string, number>();
  return {
    createIndex: jest.fn().mockResolvedValue('ok'),
    findOneAndUpdate: jest.fn(async (filter: { _id: string }) => {
      const count = (docs.get(filter._id) ?? 0) + 1;
      docs.set(filter._id, count);
      return { _id: filter._id, count };
    }),
  };
};

describe('SimpleRateLimitGuard', () => {
  it('em memória, bloqueia a partir da tentativa acima do limite', async () => {
    const guard = new SimpleRateLimitGuard(reflector);
    await expect(guard.canActivate(context())).resolves.toBe(true);
    await expect(guard.canActivate(context())).resolves.toBe(true);
    await expect(guard.canActivate(context())).rejects.toBeInstanceOf(HttpException);
    await expect(guard.canActivate(context('10.0.0.2'))).resolves.toBe(true);
  });

  it('com RATE_LIMIT_STORE=mongo, duas réplicas compartilham o contador', async () => {
    const collection = sharedCollection();
    const connection = { db: { collection: () => collection } } as never;
    const config = { get: (key: string) => (key === 'RATE_LIMIT_STORE' ? 'mongo' : undefined) } as never;
    const replicaA = new SimpleRateLimitGuard(reflector, config, connection);
    const replicaB = new SimpleRateLimitGuard(reflector, config, connection);

    await expect(replicaA.canActivate(context())).resolves.toBe(true);
    await expect(replicaB.canActivate(context())).resolves.toBe(true);
    await expect(replicaA.canActivate(context())).rejects.toBeInstanceOf(HttpException);
    expect(collection.createIndex).toHaveBeenCalledWith({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  });

  it('se o banco falhar, usa a memória em vez de bloquear o login', async () => {
    const out = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const collection = { createIndex: jest.fn().mockResolvedValue('ok'), findOneAndUpdate: jest.fn().mockRejectedValue(new Error('offline')) };
    const config = { get: () => 'mongo' } as never;
    const guard = new SimpleRateLimitGuard(reflector, config, { db: { collection: () => collection } } as never);
    await expect(guard.canActivate(context())).resolves.toBe(true);
    expect(String(out.mock.calls[0][0])).toContain('rate_limit_store_unavailable');
    out.mockRestore();
  });
});
