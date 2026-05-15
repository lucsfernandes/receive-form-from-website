/**
 * HttpError: throw with an explicit status + safe public message.
 * The error handler maps it directly to a response, so use this when
 * you want a non-500 status from anywhere in the request pipeline.
 */
export class HttpError extends Error {
  public readonly status: number;
  public readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.name = 'HttpError';
  }
}
