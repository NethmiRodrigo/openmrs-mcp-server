import { beforeAll, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { OpenMrsClient } from "../src/openmrs/client.js";
import { connect } from "./helpers/connect.js";

const ZERO = "00000000-0000-0000-0000-000000000000";

const text = (res: { content: unknown }) => (res.content as { text: string }[])[0]!.text;
const json = (res: { content: unknown }) => JSON.parse(text(res));

describe("live (local nightly server)", () => {
  let call: Awaited<ReturnType<typeof connect>>["call"];
  let patientUuid: string;

  beforeAll(async () => {
    const config = loadConfig({
      OPENMRS_URL: "http://localhost/openmrs",
      OPENMRS_USERNAME: "admin",
      OPENMRS_PASSWORD: "Admin123",
    });
    ({ call } = await connect(new OpenMrsClient(config)));
  });

  it("login works", async () => {
    const res = await call("search_patients", { query: "john" });
    expect(res.isError).toBeFalsy();
    expect(json(res).results.length).toBeGreaterThanOrEqual(1);
  });

  it("discover a patient with data", async () => {
    const res = await call("openmrs_request", {
      path: "/ws/rest/v1/visit",
      query: { includeInactive: true, limit: 1, v: "custom:(patient:(uuid))" },
    });
    expect(res.isError).toBeFalsy();
    patientUuid = json(res).results[0].patient.uuid;
    expect(patientUuid).toMatch(/^[A-Za-z0-9-]+$/);
  });

  it("summary", async () => {
    const res = await call("get_patient_summary", { patientUuid });
    expect(res.isError).toBeFalsy();
    const summary = json(res);
    expect(["not recorded", "no known allergies", "see list"]).toContain(summary.allergies.status);
    expect(Array.isArray(summary.mostRecentObsOfAnyType.results)).toBe(true);
  });

  it("visits and encounters", async () => {
    for (const tool of ["get_visits", "get_encounters"]) {
      const res = await call(tool, { patientUuid });
      expect(res.isError).toBeFalsy();
      expect(json(res).results.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("unknown patient", async () => {
    const res = await call("get_visits", { patientUuid: ZERO });
    expect(text(res)).toBe(`No patient with UUID ${ZERO}.`);
  });

  it("unknown concept", async () => {
    const res = await call("get_observations", { patientUuid, conceptUuids: [ZERO] });
    expect(text(res)).toBe(`No concept with UUID ${ZERO}.`);
  });

  it("unknown encounter type", async () => {
    const res = await call("get_encounters", { patientUuid, encounterTypeUuid: ZERO });
    expect(text(res)).toBe(`No encounter type with UUID ${ZERO}.`);
  });

  it("unknown visit", async () => {
    const res = await call("get_encounters", { patientUuid, visitUuid: ZERO });
    expect(text(res)).toBe(`No visit with UUID ${ZERO}.`);
  });

  it("concept search", async () => {
    const res = await call("search_concepts", { query: "weight" });
    expect(res.isError).toBeFalsy();
    expect(json(res).results.length).toBeGreaterThanOrEqual(1);
  });

  it("paging", async () => {
    const res = await call("get_observations", { patientUuid, limit: 2 });
    expect(res.isError).toBeFalsy();
    const page = json(res);
    expect(typeof page.totalCount).toBe("number");
    if (page.totalCount > 2) expect(page.nextStartIndex).toBe(2);
  });
});
