export interface SuccessBody<T> {
  success: true;
  data: T;
}

export interface ErrorBody {
  success: false;
  error: { code: string; message: string; details?: unknown };
}

export const ok = <T>(data: T): SuccessBody<T> => ({ success: true, data });

export const fail = (code: string, message: string, details?: unknown): ErrorBody => ({
  success: false,
  error: details === undefined ? { code, message } : { code, message, details },
});
