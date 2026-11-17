import { z } from "zod";
import { stripLinks, toPage } from "../openmrs/shape.js";
import { fail, ok, type ToolRegistrar } from "./common.js";

export const registerOpenmrsRequest: ToolRegistrar = (server, getClient) => {
  server.registerTool(
    "openmrs_request",
    {
      title: "OpenMRS GET request",
      description:
        "Read-only GET against the OpenMRS instance. REST v1 is under /ws/rest/v1/ and FHIR R4 under /ws/fhir2/R4/ (if the FHIR2 module is installed). Use v=custom:(...) and limit to keep responses small. An empty results list can mean a wrong UUID; check the referenced resource directly.",
      inputSchema: {
        path: z.string(),
        query: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ path, query }, extra) => {
      try {
        const client = await getClient(extra);
        const result = await client.get(path, query);
        if (result.status === 204) return { content: [{ type: "text", text: "HTTP 204, no content" }] };
        const body = result.body;
        if (typeof body === "object" && body !== null && Array.isArray((body as { results?: unknown }).results)) {
          const start = Number(query?.startIndex ?? 0);
          return ok(toPage(body, Number.isFinite(start) ? start : 0));
        }
        return ok(stripLinks(body));
      } catch (err) {
        return fail(err);
      }
    },
  );
};
