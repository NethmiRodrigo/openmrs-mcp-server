import { describe, expect, it } from "vitest";
import { OpenMrsError } from "../../src/openmrs/errors.js";
import { fakeClient } from "../helpers/fakeClient.js";
import { connect } from "../helpers/connect.js";

const PATIENT = "/ws/rest/v1/patient/p1";
const ALLERGY = "/ws/rest/v1/patient/p1/allergy";
const COND = "/ws/rest/v1/condition";
const VISIT = "/ws/rest/v1/visit";
const OBS = "/ws/rest/v1/obs";
const patient = { status: 200, body: { uuid: "p1", links: [{ rel: "self" }] } } as const;
const page = { status: 200, body: { results: [{ uuid: "r" }] } } as const;
const textOf = (res: { content: unknown }) => (res.content as { text: string }[])[0]!.text;

function routes(over: Record<string, unknown> = {}) {
  return {
    [PATIENT]: patient,
    [COND]: page,
    [ALLERGY]: { status: 204 },
    [VISIT]: page,
    [OBS]: page,
    ...over,
  } as Parameters<typeof fakeClient>[0];
}

describe("get_patient_summary", () => {
  it("reports an unknown patient and makes no other calls", async () => {
    const client = fakeClient(routes({ [PATIENT]: new OpenMrsError("not_found", "Not found: x.", 404) }));
    const { call } = await connect(client);
    const res = await call("get_patient_summary", { patientUuid: "p1" });
    expect(res.isError).toBe(true);
    expect(textOf(res)).toBe("No patient with UUID p1.");
    expect(client.calls.map((c) => c.path)).toEqual([PATIENT]);
  });

  it("fails the whole tool on another patient error", async () => {
    const client = fakeClient(routes({ [PATIENT]: new OpenMrsError("forbidden", "no privilege", 403) }));
    const { call } = await connect(client);
    const res = await call("get_patient_summary", { patientUuid: "p1" });
    expect(res.isError).toBe(true);
    expect(textOf(res)).toBe("no privilege");
    expect(client.calls).toHaveLength(1);
  });

  it("runs the four section calls after the patient call", async () => {
    const client = fakeClient(routes());
    const { call } = await connect(client);
    const res = await call("get_patient_summary", { patientUuid: "p1" });
    expect(res.isError).toBeUndefined();
    expect(client.calls[0]!.path).toBe(PATIENT);
    const byPath = Object.fromEntries(client.calls.map((c) => [c.path, c.query]));
    expect(client.calls).toHaveLength(5);
    expect(byPath[COND]).toMatchObject({ patientUuid: "p1", limit: 100 });
    expect(byPath[ALLERGY]).toBeUndefined();
    expect(byPath[VISIT]).toMatchObject({ patient: "p1", includeInactive: true, limit: 5 });
    expect(byPath[OBS]).toMatchObject({ patient: "p1", limit: 20 });
    const out = JSON.parse(textOf(res));
    expect(out.patient).toEqual({ uuid: "p1" });
    expect(out.activeConditions.results).toHaveLength(1);
  });

  it.each([
    ["204", { status: 204 }, { status: "not recorded" }],
    ["empty list", { status: 200, body: { results: [] } }, { status: "no known allergies" }],
    [
      "items",
      { status: 200, body: { results: [{ uuid: "a", links: [] }, { uuid: "b" }] } },
      { status: "see list", items: [{ uuid: "a" }, { uuid: "b" }] },
    ],
  ])("allergy status: %s", async (_name, route, expected) => {
    const { call } = await connect(fakeClient(routes({ [ALLERGY]: route })));
    const out = JSON.parse(textOf(await call("get_patient_summary", { patientUuid: "p1" })));
    expect(out.allergies).toEqual(expected);
  });

  it("turns a failed section into an error entry", async () => {
    const client = fakeClient(routes({ [COND]: new OpenMrsError("forbidden", "no condition privilege", 403) }));
    const { call } = await connect(client);
    const res = await call("get_patient_summary", { patientUuid: "p1" });
    expect(res.isError).toBeUndefined();
    const out = JSON.parse(textOf(res));
    expect(out.activeConditions).toEqual({ error: "no condition privilege" });
    expect(out.recentVisits.results).toHaveLength(1);
    expect(out.mostRecentObsOfAnyType.results).toHaveLength(1);
    expect(out.allergies).toEqual({ status: "not recorded" });
  });

  it("prefixes non-OpenMrsError section failures", async () => {
    const { call } = await connect(fakeClient(routes({ [VISIT]: undefined })));
    const out = JSON.parse(textOf(await call("get_patient_summary", { patientUuid: "p1" })));
    expect(out.recentVisits.error).toMatch(/^Internal error: /);
  });

  it("shapes obs values", async () => {
    const obs = {
      status: 200,
      body: {
        results: [
          { uuid: "1", value: "bin", concept: { datatype: { display: "Complex" } } },
          { uuid: "2", value: "x".repeat(800), concept: { datatype: { display: "Text" } } },
          { uuid: "3", value: 42, concept: { datatype: { display: "Numeric" } } },
          { uuid: "4", value: { uuid: "c", display: "Yes" }, concept: { datatype: { display: "Coded" } } },
        ],
      },
    };
    const { call } = await connect(fakeClient(routes({ [OBS]: obs })));
    const out = JSON.parse(textOf(await call("get_patient_summary", { patientUuid: "p1" })));
    const r = out.mostRecentObsOfAnyType.results;
    expect(r[0].value).toBe("[attachment omitted]");
    expect(r[1].value).toBe("x".repeat(500) + "…");
    expect(r[2].value).toBe(42);
    expect(r[3].value).toEqual({ uuid: "c", display: "Yes" });
  });

  it("summary obs request has no top-level display", async () => {
    const client = fakeClient(routes());
    const { call } = await connect(client);
    await call("get_patient_summary", { patientUuid: "p1" });
    const v = String(client.calls.find((c) => c.path === OBS)!.query!.v);
    const topLevel = v.replace(/\([^()]*\)/g, "").replace(/\([^()]*\)/g, "");
    expect(topLevel).not.toContain("display");
    expect(v).toContain("datatype:(display)");
  });
});
