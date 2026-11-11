import { EventEmitter } from 'events';
import { requestLoggingMiddleware, resolveRequestId } from './request-logging';

describe('request logging', () => {
  it('aceita somente identificadores seguros vindos do cliente', () => {
    expect(resolveRequestId('abc12345-proxy')).toBe('abc12345-proxy');
    expect(resolveRequestId('bad id\ninjetado')).not.toContain('\n');
    expect(resolveRequestId('curto')).toMatch(/^[0-9a-f-]{36}$/);
    expect(resolveRequestId(undefined)).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('registra uma linha JSON por requisição, sem a query string', () => {
    const write = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const out = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const res = Object.assign(new EventEmitter(), { statusCode: 404, setHeader: jest.fn() });
    const req = { header: () => 'req-12345678', path: '/clientes', method: 'GET', originalUrl: '/clientes?busca=Maria', user: { id: 'u1', empresaId: 'e1' } };
    const next = jest.fn();

    requestLoggingMiddleware({ enabled: true })(req as never, res as never, next);
    res.emit('finish');

    expect(next).toHaveBeenCalled();
    expect(res.setHeader).toHaveBeenCalledWith('X-Request-Id', 'req-12345678');
    const line = JSON.parse(String(out.mock.calls[0][0]));
    expect(line).toMatchObject({ level: 'warn', msg: 'http_request', requestId: 'req-12345678', path: '/clientes', status: 404, empresaId: 'e1', userId: 'u1' });
    expect(String(out.mock.calls[0][0])).not.toContain('Maria');
    write.mockRestore();
    out.mockRestore();
  });

  it('pode ser desligado sem perder o X-Request-Id', () => {
    const out = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const res = Object.assign(new EventEmitter(), { statusCode: 200, setHeader: jest.fn() });
    requestLoggingMiddleware({ enabled: false })({ header: () => undefined, path: '/x', method: 'GET' } as never, res as never, jest.fn());
    res.emit('finish');
    expect(res.setHeader).toHaveBeenCalledWith('X-Request-Id', expect.any(String));
    expect(out).not.toHaveBeenCalled();
    out.mockRestore();
  });
});
