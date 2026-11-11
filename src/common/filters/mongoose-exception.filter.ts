import { ArgumentsHost, BadRequestException, Catch } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';

/**
 * Converte erros de identificador invalido (CastError/BSONError do Mongoose) em 400.
 * Todas as demais excecoes sao delegadas ao tratador padrao do Nest, que responde
 * sempre em JSON ({ statusCode, message }) e oculta detalhes de erros inesperados (500).
 *
 * Importante: nao relancar a excecao aqui. Um filtro que faz `throw` tira o erro do
 * tratador do Nest e o Express responde com pagina HTML (com stack trace em dev).
 */
@Catch()
export class MongooseExceptionFilter extends BaseExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    if (this.isInvalidObjectIdError(exception)) {
      super.catch(new BadRequestException('Identificador invalido.'), host);
      return;
    }

    super.catch(exception, host);
  }

  private isInvalidObjectIdError(exception: unknown) {
    const error = exception as { name?: string; kind?: string; message?: string; getStatus?: unknown };
    if (typeof error?.getStatus === 'function') {
      return false;
    }

    return (
      (error?.name === 'CastError' && error?.kind === 'ObjectId') ||
      error?.name === 'BSONError' ||
      /ObjectId/i.test(String(error?.message ?? ''))
    );
  }
}
