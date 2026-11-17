export type OpenMrsErrorKind =
  | "bad_request"
  | "login"
  | "forbidden"
  | "not_found"
  | "server"
  | "network"
  | "redirect"
  | "invalid_path";

export class OpenMrsError extends Error {
  readonly kind: OpenMrsErrorKind;
  readonly status?: number;

  constructor(kind: OpenMrsErrorKind, message: string, status?: number) {
    super(message);
    this.name = "OpenMrsError";
    this.kind = kind;
    this.status = status;
  }
}
