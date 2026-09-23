import { ArgumentsHost, BadRequestException, Catch, ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';

@Catch()
export class MongooseExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    if (!this.isInvalidObjectIdError(exception)) {
      throw exception;
    }

    const response = host.switchToHttp().getResponse<Response>();
    const error = new BadRequestException('Identificador invalido.');
    const body = error.getResponse();
    response.status(error.getStatus()).json(body);
  }

  private isInvalidObjectIdError(exception: unknown) {
    const error = exception as { name?: string; kind?: string; message?: string };
    return (
      (error?.name === 'CastError' && error?.kind === 'ObjectId') ||
      error?.name === 'BSONError' ||
      /ObjectId/i.test(String(error?.message ?? ''))
    );
  }
}
