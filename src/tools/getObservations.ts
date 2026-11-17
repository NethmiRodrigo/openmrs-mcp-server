import { z } from "zod";
import { assertExists, fail, limitArg, listPage, ok, seg, startIndexArg, uuidArg, type ToolRegistrar } from "./common.js";

export const registerGetObservations: ToolRegistrar = (server, getClient) => {
  server.registerTool(
    "get_observations",
    {
      title: "Get observations",
      description:
        "List observations for a patient, newest first. Optionally filter by concepts; find concept UUIDs with search_concepts; never guess them.",
      inputSchema: {
        patientUuid: uuidArg,
        conceptUuids: z.array(uuidArg).optional(),
        limit: limitArg(20),
        startIndex: startIndexArg,
      },
      annotations: { readOnlyHint: true },
    },
    async ({ patientUuid, conceptUuids, limit, startIndex }, extra) => {
      try {
        const client = await getClient(extra);
        await assertExists(client, `/ws/rest/v1/patient/${seg(patientUuid)}`, `No patient with UUID ${patientUuid}.`);
        for (const conceptUuid of conceptUuids ?? []) {
          await assertExists(client, `/ws/rest/v1/concept/${seg(conceptUuid)}`, `No concept with UUID ${conceptUuid}.`);
        }
        const page = await listPage(
          client,
          "/ws/rest/v1/obs",
          {
            patient: patientUuid,
            ...(conceptUuids && conceptUuids.length > 0 ? { concepts: conceptUuids.join(",") } : {}),
            v: "custom:(uuid,display,obsDatetime,value,concept:(uuid,display),encounter:(uuid))",
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
