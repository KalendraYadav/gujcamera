import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

export const REQUEST_ID_HEADER = 'x-request-id';

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const incomingId = req.headers[REQUEST_ID_HEADER] as string;
    const requestId = incomingId && incomingId.trim() !== '' ? incomingId : uuidv4();

    req['requestId'] = requestId;
    res.setHeader(REQUEST_ID_HEADER, requestId);
    next();
  }
}
