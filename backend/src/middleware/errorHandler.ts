import { Request, Response, NextFunction } from 'express';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction) {
  if (err instanceof ApiError) {
    return res.status(err.status).json({ error: err.message });
  }
  console.error('[unhandled error]', err);
  return res.status(500).json({ error: 'Server unavailable. Please try again later.' });
}

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ error: 'Resource not found' });
}
