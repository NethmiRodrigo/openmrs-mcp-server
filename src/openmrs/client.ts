import { STATUS_CODES } from "node:http";
import type { Config } from "../config.js";
import { OpenMrsError } from "./errors.js";
import { buildUrl, type Query } from "./url.js";

export type GetResult = { status: 200; body: unknown } | { status: 204 };

type LoginState = "unknown" | "ok" | "failed";

const FETCH_TIMEOUT_MS = 30_000;

const SESSION_PATH = "/ws/rest/v1/session";

const LOGIN_MESSAGE =
  "Login failed. Check the username and password in the extension settings. Passwords that contain ':' and instances with two-factor login are not supported.";

function loginError(status?: number): OpenMrsError {
  return new OpenMrsError("login", LOGIN_MESSAGE, status);
}

function errorMessage(body: unknown, response: Response): string {
  if (typeof body === "object" && body !== null) {
    const error = (body as { error?: unknown }).error;
    if (typeof error === "object" && error !== null) {
      const message = (error as { message?: unknown }).message;
      if (typeof message === "string" && message !== "") return message;
    }
  }
  return response.statusText || STATUS_CODES[response.status] || "Unknown error";
}

export class OpenMrsClient {
  readonly baseUrl: string;
  private readonly authorization: string;
  private loginState: LoginState = "unknown";
  private loginCheck: Promise<LoginState> | undefined;

  constructor(
    private readonly config: Config,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.baseUrl = config.baseUrl;
    this.authorization =
      "Basic " + Buffer.from(`${config.username}:${config.password}`, "utf8").toString("base64");
  }

  async get(path: string, query?: Query): Promise<GetResult> {
    const url = buildUrl(this.baseUrl, path, query);
    await this.ensureLogin();
    return this.request(url, path);
  }

  private async ensureLogin(): Promise<void> {
    if (this.loginState === "unknown") {
      this.loginCheck ??= this.checkSession().finally(() => {
        this.loginCheck = undefined;
      });
      this.loginState = await this.loginCheck;
    }
    if (this.loginState === "failed") throw loginError();
  }

  // Resolves "ok" or "failed" (latched). Any other failure rejects and is not latched.
  private async checkSession(): Promise<LoginState> {
    const result = await this.request(buildUrl(this.baseUrl, SESSION_PATH), SESSION_PATH);
    if (result.status === 200) {
      const body = result.body as { authenticated?: unknown } | null;
      if (body !== null && typeof body === "object" && body.authenticated === false) {
        return "failed";
      }
    }
    return "ok";
  }

  private networkError(): OpenMrsError {
    return new OpenMrsError(
      "network",
      `Could not read a JSON response from ${this.baseUrl}. Check openmrs_url in the extension settings; it must include the webapp path, e.g. https://host/openmrs.`,
    );
  }

  private async request(url: URL, path: string): Promise<GetResult> {
    let response: Response;
    let text: string;
    try {
      response = await this.fetchImpl(url, {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: { Authorization: this.authorization, Accept: "application/json" },
      });
      text = response.status === 204 ? "" : await response.text();
    } catch {
      throw this.networkError();
    }

    const status = response.status;
    if (status >= 300 && status < 400) {
      const location = response.headers.get("location") ?? "(none)";
      throw new OpenMrsError(
        "redirect",
        `OpenMRS answered with a redirect (${status}) to ${location}. Check openmrs_url in the extension settings.`,
        status,
      );
    }
    if (status === 204) return { status: 204 };

    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      if (status === 401) throw loginError(status);
      throw this.networkError();
    }

    if (status === 401) throw loginError(status);
    const message = errorMessage(body, response);
    if (status === 400) throw new OpenMrsError("bad_request", `Bad request: ${message}.`, status);
    if (status === 403) {
      throw new OpenMrsError(
        "forbidden",
        `The OpenMRS user does not have the privilege to read this: ${message}.`,
        status,
      );
    }
    if (status === 404) throw new OpenMrsError("not_found", `Not found: ${path}.`, status);
    if (status >= 400 && status < 500) {
      throw new OpenMrsError("bad_request", `Bad request: ${message}.`, status);
    }
    const isErrorBody =
      typeof body === "object" && body !== null && ("error" in body || "stackTrace" in body);
    if (status >= 500 || status < 200 || isErrorBody) {
      throw new OpenMrsError("server", `OpenMRS server error: ${message}.`, status);
    }
    return { status: 200, body };
  }
}
