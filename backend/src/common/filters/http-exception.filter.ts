import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestId = (request['requestId'] as string) || 'UNKNOWN_REQ_ID';

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let errorCode = 'INTERNAL_SERVER_ERROR';
    let message = 'An unexpected error occurred';
    let existingCamera: any = undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res: any = exception.getResponse();

      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object' && res !== null) {
        message = res.message || res.error || message;
        errorCode = res.error_code || this.statusToErrorCode(status);
        if (res.existing_camera) {
          existingCamera = res.existing_camera;
        }
        if (Array.isArray(message)) {
          // Flatten class-validator message array
          message = message.join('; ');
        }
      }
    } else if (exception instanceof Error) {
      // Log full internal error server-side, but keep client message sanitized
      this.logger.error(`[${requestId}] Unhandled Error: ${exception.message}`, exception.stack);
      errorCode = 'SERVER_ERROR';
      message = 'An internal server error occurred';
    }

    // Default error code if not already set
    if (!errorCode || errorCode === 'INTERNAL_SERVER_ERROR') {
      errorCode = this.statusToErrorCode(status);
    }

    const errorPayload: Record<string, any> = {
      error_code: errorCode,
      message: message,
      request_id: requestId,
      timestamp: new Date().toISOString(),
    };

    if (existingCamera) {
      errorPayload.existing_camera = existingCamera;
    }

    response.status(status).json(errorPayload);
  }

  private statusToErrorCode(status: number): string {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return 'BAD_REQUEST';
      case HttpStatus.UNAUTHORIZED:
        return 'UNAUTHORIZED';
      case HttpStatus.FORBIDDEN:
        return 'FORBIDDEN_RESOURCE';
      case HttpStatus.NOT_FOUND:
        return 'NOT_FOUND';
      case HttpStatus.CONFLICT:
        return 'CONFLICT';
      case HttpStatus.TOO_MANY_REQUESTS:
        return 'RATE_LIMIT_EXCEEDED';
      case HttpStatus.UNPROCESSABLE_ENTITY:
        return 'UNPROCESSABLE_ENTITY';
      default:
        return 'INTERNAL_SERVER_ERROR';
    }
  }
}
