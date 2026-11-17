import { OpenMrsError } from "../openmrs/errors.js";
import { stripLinks, type Page } from "../openmrs/shape.js";
import { fail, listPage, ok, seg, uuidArg, type ToolRegistrar } from "./common.js";

const PATIENT_V =
  "custom:(uuid,display,identifiers:(display),person:(gender,age,birthdate,dead,deathDate,preferredAddress:(display)))";
const VISIT_V = "custom:(uuid,display,startDatetime,stopDatetime,visitType:(display),location:(display))";
const OBS_V = "custom:(uuid,obsDatetime,value,concept:(uuid,display,datatype:(display)),encounter:(uuid))";

type SectionError = { error: string };

function errorMessage(err: unknown): string {
  return err instanceof OpenMrsError
    ? err.message
    : `Internal error: ${err instanceof Error ? err.message : String(err)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function shapeObs(obs: unknown): unknown {
  if (!isRecord(obs)) return obs;
  const concept = obs.concept;
  const datatype = isRecord(concept) && isRecord(concept.datatype) ? concept.datatype.display : undefined;
  if (datatype === "Complex") return { ...obs, value: "[attachment omitted]" };
  if (typeof obs.value === "string" && obs.value.length > 500) {
    return { ...obs, value: obs.value.slice(0, 500) + "…" };
  }
  return obs;
}

export const registerGetPatientSummary: ToolRegistrar = (server, getClient) => {
  server.registerTool(
    "get_patient_summary",
    {
      title: "Get patient summary",
      description:
        "Summarize a patient in one call: demographics, active conditions, allergies, the 5 most recent visits and the 20 most recent observations. A section that fails is reported as { error } while the other sections are still returned.",
      inputSchema: { patientUuid: uuidArg },
      annotations: { readOnlyHint: true },
    },
    async ({ patientUuid }, extra) => {
      try {
        const client = await getClient(extra);
        let patient: unknown;
        try {
          const res = await client.get(`/ws/rest/v1/patient/${seg(patientUuid)}`, { v: PATIENT_V });
          patient = res.status === 200 ? stripLinks(res.body) : null;
        } catch (err) {
          if (err instanceof OpenMrsError && err.kind === "not_found") {
            return fail(new OpenMrsError("not_found", `No patient with UUID ${patientUuid}.`, err.status));
          }
          throw err;
        }

        const [conditions, allergies, visits, obs] = await Promise.allSettled([
          listPage(client, "/ws/rest/v1/condition", { patientUuid }, 100, 0),
          (async () => {
            const res = await client.get(`/ws/rest/v1/patient/${seg(patientUuid)}/allergy`);
            if (res.status === 204) return { status: "not recorded" as const };
            const body = res.body;
            const results = isRecord(body) && Array.isArray(body.results) ? body.results : [];
            if (results.length === 0) return { status: "no known allergies" as const };
            return { status: "see list" as const, items: stripLinks(results) as unknown[] };
          })(),
          listPage(
            client,
            "/ws/rest/v1/visit",
            { patient: patientUuid, includeInactive: true, v: VISIT_V },
            5,
            0,
          ),
          listPage(client, "/ws/rest/v1/obs", { patient: patientUuid, v: OBS_V }, 20, 0).then(
            (p): Page => ({ ...p, results: p.results.map(shapeObs) }),
          ),
        ]);

        const section = <T>(r: PromiseSettledResult<T>): T | SectionError =>
          r.status === "fulfilled" ? r.value : { error: errorMessage(r.reason) };

        return ok({
          patient,
          activeConditions: section(conditions),
          allergies: section(allergies),
          recentVisits: section(visits),
          mostRecentObsOfAnyType: section(obs),
        });
      } catch (err) {
        return fail(err);
      }
    },
  );
};
