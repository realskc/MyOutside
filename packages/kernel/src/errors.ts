export type KernelErrorCode =
  | "UNKNOWN_FUNCTION"
  | "VALIDATION"
  | "TX_CALL_INVALID"
  | "CALL_DEPTH_EXCEEDED"
  | "NOT_FOUND"
  | "PRECONDITION"
  | "UPSTREAM"
  | "INTERNAL";

export class KernelError extends Error {
  readonly code: KernelErrorCode;
  readonly details?: unknown;

  constructor(code: KernelErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "KernelError";
    this.code = code;
    this.details = details;
  }
}
