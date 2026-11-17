import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type { CallToolResult, ServerNotification, ServerRequest } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { OpenMrsClient } from "../openmrs/client.js";
import { OpenMrsError } from "../openmrs/errors.js";
import { toPage, toText, type Page } from "../openmrs/shape.js";
import type { Query } from "../openmrs/url.js";

export type Extra = RequestHandlerExtra<ServerRequest, ServerNotification>;
export type GetClient = (extra: Extra) => Promise<OpenMrsClient>;
export type ToolRegistrar = (server: McpServer, getClient: GetClient) => void;

export const limitArg = (def: number): z.ZodType<number, z.ZodTypeDef, number | undefined> =>
  z
    .number()
    .optional()
    .transform((value) => Math.min(100, Math.max(1, Math.trunc(value ?? def))));

export const startIndexArg: z.ZodType<number, z.ZodTypeDef, number | undefined> = z
  .number()
  .int()
  .min(0)
  .optional()
  .default(0);

export const uuidArg = z.string().regex(/^[A-Za-z0-9-]+$/);

export function seg(id: string): string {
  return encodeURIComponent(id);
}

export function isResultsBody(body: unknown): boolean {
  return typeof body === "object" && body !== null && Array.isArray((body as { results?: unknown }).results);
}

export async function listPage(
  client: OpenMrsClient,
  path: string,
  query: Query,
  limit: number,
  startIndex: number,
): Promise<Page> {
  const result = await client.get(path, { ...query, limit, startIndex, totalCount: true });
  if (result.status === 204) return { results: [], startIndex };
  if (!isResultsBody(result.body)) {
    throw new OpenMrsError("server", "OpenMRS server error: the response has no results list.");
  }
  return toPage(result.body, startIndex);
}

export async function assertExists(
  client: OpenMrsClient,
  path: string,
  notFoundMessage: string,
): Promise<void> {
  try {
    await client.get(path, { v: "custom:(uuid)" });
  } catch (err) {
    if (err instanceof OpenMrsError && err.kind === "not_found") {
      throw new OpenMrsError("not_found", notFoundMessage, err.status);
    }
    throw err;
  }
}

export function ok(value: unknown): CallToolResult {
  return { content: [{ type: "text", text: toText(value) }] };
}

export function fail(err: unknown): CallToolResult {
  const text =
    err instanceof OpenMrsError
      ? err.message
      : `Internal error: ${err instanceof Error ? err.message : String(err)}`;
  return { isError: true, content: [{ type: "text", text }] };
}

export function invalidInput(message: string): OpenMrsError {
  return new OpenMrsError("bad_request", message);
}
