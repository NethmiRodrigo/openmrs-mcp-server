import { z } from "zod";
import { fail, invalidInput, limitArg, listPage, ok, startIndexArg, type ToolRegistrar } from "./common.js";

export const registerSearchPatients: ToolRegistrar = (server, getClient) => {
  server.registerTool(
    "search_patients",
    {
      title: "Search patients",
      description:
        "Search patients by name or identifier. The query needs at least 2 characters. Returns uuid, display, gender, age and birthdate.",
      inputSchema: {
        query: z.string(),
        limit: limitArg(10),
        startIndex: startIndexArg,
      },
      annotations: { readOnlyHint: true },
    },
    async ({ query, limit, startIndex }, extra) => {
      try {
        const q = query.trim();
        if (q.length < 2) throw invalidInput("The search query needs at least 2 characters.");
        const client = await getClient(extra);
        const page = await listPage(
          client,
          "/ws/rest/v1/patient",
          { q, v: "custom:(uuid,display,person:(gender,age,birthdate))" },
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
