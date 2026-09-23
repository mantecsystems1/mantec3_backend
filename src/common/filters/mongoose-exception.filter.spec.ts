import { MongooseExceptionFilter } from './mongoose-exception.filter';

describe('MongooseExceptionFilter', () => {
  it('converte CastError de ObjectId em 400 sem expor detalhes internos', () => {
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
      }),
    } as never;

    new MongooseExceptionFilter().catch({ name: 'CastError', kind: 'ObjectId', message: 'Cast to ObjectId failed' }, host);

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Identificador invalido.',
    }));
  });

  it('propaga erros que nao sao de ObjectId', () => {
    const error = new Error('erro real');
    expect(() => new MongooseExceptionFilter().catch(error, {} as never)).toThrow(error);
  });
});
