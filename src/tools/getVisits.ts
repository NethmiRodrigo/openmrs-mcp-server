import { z } from "zod";
import { assertExists, fail, limitArg, listPage, ok, seg, startIndexArg, uuidArg, type ToolRegistrar } from "./common.js";

export const registerGetVisits: ToolRegistrar = (server, getClient) => {
  server.registerTool(
    "get_visits",
    {
      title: "Get visits",
      description: "List visits for a patient. Includes inactive (ended) visits by default.",
      inputSchema: {
        patientUuid: uuidArg,
        includeInactive: z.boolean().optional().default(true),
        limit: limitArg(10),
        startIndex: startIndexArg,
      },
      annotations: { readOnlyHint: true },
    },
    async ({ patientUuid, includeInactive, limit, startIndex }, extra) => {
      try {
        const client = await getClient(extra);
        await assertExists(client, `/ws/rest/v1/patient/${seg(patientUuid)}`, `No patient with UUID ${patientUuid}.`);
        const page = await listPage(
          client,
          "/ws/rest/v1/visit",
          {
            patient: patientUuid,
            includeInactive,
            v: "custom:(uuid,display,startDatetime,stopDatetime,visitType:(display),location:(display))",
          },
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
