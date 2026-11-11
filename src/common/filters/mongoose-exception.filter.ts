import { ArgumentsHost, BadRequestException, Catch, HttpException } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { writeLog, type RequestWithId } from '../observability/request-logging';

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

    this.logServerError(exception, host);
    super.catch(exception, host);
  }

  /** Erros inesperados (5xx) ficam registrados com o código de suporte que o usuário vê. */
  private logServerError(exception: unknown, host: ArgumentsHost) {
    const status = exception instanceof HttpException ? exception.getStatus() : 500;
    if (status < 500 || host.getType() !== 'http') return;
    const request = host.switchToHttp().getRequest<RequestWithId>();
    const error = exception as { name?: string; message?: string; stack?: string };
    writeLog({
      level: 'error',
      msg: 'unhandled_error',
      requestId: request?.requestId,
      method: request?.method,
      path: request?.path,
      status,
      error: error?.name ?? 'Error',
      message: error?.message,
      stack: error?.stack,
    });
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
