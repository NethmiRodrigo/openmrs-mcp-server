import { z } from "zod";
import { assertExists, fail, limitArg, listPage, ok, seg, startIndexArg, uuidArg, type ToolRegistrar } from "./common.js";

const dateArg = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const registerGetEncounters: ToolRegistrar = (server, getClient) => {
  server.registerTool(
    "get_encounters",
    {
      title: "Get encounters",
      description:
        "List encounters for a patient, newest first. Optionally filter by visit, encounter type or date range. Dates are YYYY-MM-DD and both inclusive.",
      inputSchema: {
        patientUuid: uuidArg,
        visitUuid: uuidArg.optional(),
        encounterTypeUuid: uuidArg.optional(),
        fromDate: dateArg.optional(),
        toDate: dateArg.optional(),
        limit: limitArg(10),
        startIndex: startIndexArg,
      },
      annotations: { readOnlyHint: true },
    },
    async ({ patientUuid, visitUuid, encounterTypeUuid, fromDate, toDate, limit, startIndex }, extra) => {
      try {
        const client = await getClient(extra);
        await assertExists(client, `/ws/rest/v1/patient/${seg(patientUuid)}`, `No patient with UUID ${patientUuid}.`);
        if (visitUuid !== undefined) {
          await assertExists(client, `/ws/rest/v1/visit/${seg(visitUuid)}`, `No visit with UUID ${visitUuid}.`);
        }
        if (encounterTypeUuid !== undefined) {
          await assertExists(
            client,
            `/ws/rest/v1/encountertype/${seg(encounterTypeUuid)}`,
            `No encounter type with UUID ${encounterTypeUuid}.`,
          );
        }
        const page = await listPage(
          client,
          "/ws/rest/v1/encounter",
          {
            patient: patientUuid,
            order: "desc",
            ...(visitUuid !== undefined ? { visit: visitUuid } : {}),
            ...(encounterTypeUuid !== undefined ? { encounterType: encounterTypeUuid } : {}),
            ...(fromDate !== undefined ? { fromdate: fromDate } : {}),
            ...(toDate !== undefined ? { todate: `${toDate}T23:59:59.999` } : {}),
            v: "custom:(uuid,display,encounterDatetime,encounterType:(display),location:(display),visit:(uuid))",
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
