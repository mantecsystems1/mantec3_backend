import { ConflictException } from '@nestjs/common';
import { MongooseExceptionFilter } from './mongoose-exception.filter';

const createHost = () => {
  const response = {};
  const host = {
    getArgByIndex: (index: number) => (index === 1 ? response : undefined),
    getArgs: () => [{}, response],
    getType: () => 'http',
    switchToHttp: () => ({ getResponse: () => response, getRequest: () => ({}) }),
  } as never;
  return { host, response };
};

const createAdapter = () => ({
  reply: jest.fn(),
  isHeadersSent: jest.fn().mockReturnValue(false),
  end: jest.fn(),
});

describe('MongooseExceptionFilter', () => {
  it('converte CastError de ObjectId em 400 sem expor detalhes internos', () => {
    const adapter = createAdapter();
    const { host, response } = createHost();

    new MongooseExceptionFilter(adapter as never).catch(
      { name: 'CastError', kind: 'ObjectId', message: 'Cast to ObjectId failed' },
      host,
    );

    expect(adapter.reply).toHaveBeenCalledWith(
      response,
      expect.objectContaining({ statusCode: 400, message: 'Identificador invalido.' }),
      400,
    );
  });

  it('responde em JSON com a mensagem original para excecoes HTTP (nao relanca)', () => {
    const adapter = createAdapter();
    const { host, response } = createHost();
    const error = new ConflictException('Cadastro ja existe.');

    expect(() => new MongooseExceptionFilter(adapter as never).catch(error, host)).not.toThrow();
    expect(adapter.reply).toHaveBeenCalledWith(
      response,
      expect.objectContaining({ statusCode: 409, message: 'Cadastro ja existe.' }),
      409,
    );
  });

  it('nao trata como ObjectId uma excecao HTTP cuja mensagem cita ObjectId', () => {
    const adapter = createAdapter();
    const { host, response } = createHost();

    new MongooseExceptionFilter(adapter as never).catch(new ConflictException('ObjectId duplicado'), host);

    expect(adapter.reply).toHaveBeenCalledWith(response, expect.objectContaining({ statusCode: 409 }), 409);
  });

  it('responde 500 generico para erros inesperados', () => {
    const adapter = createAdapter();
    const { host } = createHost();
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    new MongooseExceptionFilter(adapter as never).catch(new Error('falha interna com segredo'), host);

    const [, body, status] = adapter.reply.mock.calls[0];
    expect(status).toBe(500);
    expect(JSON.stringify(body)).not.toContain('segredo');
  });
});
