import { z } from "zod";
import { fail, limitArg, listPage, ok, startIndexArg, type ToolRegistrar } from "./common.js";

export const registerSearchConcepts: ToolRegistrar = (server, getClient) => {
  server.registerTool(
    "search_concepts",
    {
      title: "Search concepts",
      description: "Search the concept dictionary by name. Returns uuid, display, datatype and concept class.",
      inputSchema: {
        query: z.string(),
        limit: limitArg(10),
        startIndex: startIndexArg,
      },
      annotations: { readOnlyHint: true },
    },
    async ({ query, limit, startIndex }, extra) => {
      try {
        const client = await getClient(extra);
        const page = await listPage(
          client,
          "/ws/rest/v1/concept",
          { q: query, v: "custom:(uuid,display,datatype:(display),conceptClass:(display))" },
          limit,
          startIndex,
        );
        return ok(page);
      } catch (err) {
        return fail(err);
      }
    },
  );
};
