import { describe, expect, it } from "vitest";
import { OpenMrsError } from "../../src/openmrs/errors.js";
import { fakeClient } from "../helpers/fakeClient.js";
import { connect } from "../helpers/connect.js";

const notFound = new OpenMrsError("not_found", "Not found: x.", 404);
const PATIENT = "/ws/rest/v1/patient/p1";
const found = { status: 200, body: { uuid: "x" } } as const;
const list = { status: 200, body: { results: [{ uuid: "r" }], totalCount: 25, links: [{ rel: "next", uri: "x" }] } } as const;

const textOf = (res: { content: unknown }) => (res.content as { text: string }[])[0]!.text;

describe.each([
  ["get_observations", "/ws/rest/v1/obs"],
  ["get_visits", "/ws/rest/v1/visit"],
  ["get_encounters", "/ws/rest/v1/encounter"],
])("%s common behavior", (tool, listPath) => {
  it("rejects malformed uuid", async () => {
    const client = fakeClient({});
    const { call } = await connect(client);
    const res = await call(tool, { patientUuid: "a/../b" });
    expect(res.isError).toBe(true);
    expect(textOf(res)).toMatch(/^MCP error -32602: Input validation error/);
    expect(client.calls).toHaveLength(0);
  });

  it("checks patient first", async () => {
    const client = fakeClient({ [PATIENT]: notFound, [listPath]: list });
    const { call } = await connect(client);
    const res = await call(tool, { patientUuid: "p1" });
    expect(res.isError).toBe(true);
    expect(textOf(res)).toBe("No patient with UUID p1.");
    expect(client.calls.map((c) => c.path)).toEqual([PATIENT]);
  });

  it("returns a page with totalCount and nextStartIndex", async () => {
    const client = fakeClient({ [PATIENT]: found, [listPath]: list });
    const { call } = await connect(client);
    const res = await call(tool, { patientUuid: "p1", startIndex: 5 });
    expect(res.isError).toBeUndefined();
    const page = JSON.parse(textOf(res));
    expect(page.totalCount).toBe(25);
    expect(page.nextStartIndex).toBeDefined();
  });
});

describe("get_observations", () => {
  it("lists obs for the patient with default limit", async () => {
    const client = fakeClient({ [PATIENT]: found, "/ws/rest/v1/obs": list });
    const { call } = await connect(client);
    await call("get_observations", { patientUuid: "p1" });
    const q = client.calls[1]!.query!;
    expect(client.calls[1]!.path).toBe("/ws/rest/v1/obs");
    expect(q).toMatchObject({ patient: "p1", limit: 20 });
    expect(q).not.toHaveProperty("concepts");
    expect(String(q.v)).toContain("obsDatetime");
  });

  it("checks each concept then passes them comma-joined", async () => {
    const client = fakeClient({
      [PATIENT]: found,
      "/ws/rest/v1/concept/c1": found,
      "/ws/rest/v1/concept/c2": found,
      "/ws/rest/v1/obs": list,
    });
    const { call } = await connect(client);
    await call("get_observations", { patientUuid: "p1", conceptUuids: ["c1", "c2"] });
    expect(client.calls.map((c) => c.path)).toEqual([
      PATIENT,
      "/ws/rest/v1/concept/c1",
      "/ws/rest/v1/concept/c2",
      "/ws/rest/v1/obs",
    ]);
    expect(client.calls[3]!.query).toMatchObject({ concepts: "c1,c2" });
  });

  it("reports an unknown concept without listing", async () => {
    const client = fakeClient({ [PATIENT]: found, "/ws/rest/v1/concept/c1": notFound, "/ws/rest/v1/obs": list });
    const { call } = await connect(client);
    const res = await call("get_observations", { patientUuid: "p1", conceptUuids: ["c1"] });
    expect(res.isError).toBe(true);
    expect(textOf(res)).toBe("No concept with UUID c1.");
    expect(client.calls.map((c) => c.path)).not.toContain("/ws/rest/v1/obs");
  });

  it("rejects a malformed concept uuid", async () => {
    const client = fakeClient({});
    const { call } = await connect(client);
    const res = await call("get_observations", { patientUuid: "p1", conceptUuids: ["ok", "b/d"] });
    expect(textOf(res)).toMatch(/^MCP error -32602: Input validation error/);
    expect(client.calls).toHaveLength(0);
  });

  it("describes ordering and concept lookup", async () => {
    const { listTools } = await connect(fakeClient({}));
    const tool = (await listTools()).find((t) => t.name === "get_observations");
    expect(tool?.description).toContain("newest first");
    expect(tool?.description).toContain("find concept UUIDs with search_concepts; never guess them");
  });
});

describe("get_visits", () => {
  it("defaults to includeInactive true and limit 10", async () => {
    const client = fakeClient({ [PATIENT]: found, "/ws/rest/v1/visit": list });
    const { call } = await connect(client);
    await call("get_visits", { patientUuid: "p1" });
    expect(client.calls[1]!.query).toMatchObject({ patient: "p1", includeInactive: true, limit: 10 });
  });

  it("passes includeInactive false", async () => {
    const client = fakeClient({ [PATIENT]: found, "/ws/rest/v1/visit": list });
    const { call } = await connect(client);
    await call("get_visits", { patientUuid: "p1", includeInactive: false });
    expect(client.calls[1]!.query).toMatchObject({ includeInactive: false });
  });
});

describe("get_encounters", () => {
  it("lists newest first with default limit and no optional keys", async () => {
    const client = fakeClient({ [PATIENT]: found, "/ws/rest/v1/encounter": list });
    const { call } = await connect(client);
    await call("get_encounters", { patientUuid: "p1" });
    const q = client.calls[1]!.query!;
    expect(q).toMatchObject({ patient: "p1", order: "desc", limit: 10 });
    for (const key of ["visit", "encounterType", "fromdate", "todate"]) expect(q).not.toHaveProperty(key);
  });

  it("maps filters, checking the encounter type first", async () => {
    const client = fakeClient({
      [PATIENT]: found,
      "/ws/rest/v1/encountertype/t1": found,
      "/ws/rest/v1/encounter": list,
    });
    const { call } = await connect(client);
    await call("get_encounters", {
      patientUuid: "p1",
      visitUuid: "v1",
      encounterTypeUuid: "t1",
      fromDate: "2024-01-01",
      toDate: "2024-12-31",
    });
    expect(client.calls.map((c) => c.path)).toEqual([PATIENT, "/ws/rest/v1/encountertype/t1", "/ws/rest/v1/encounter"]);
    expect(client.calls[2]!.query).toMatchObject({
      visit: "v1",
      encounterType: "t1",
      fromdate: "2024-01-01",
      todate: "2024-12-31",
    });
  });

  it("reports an unknown encounter type without listing", async () => {
    const client = fakeClient({ [PATIENT]: found, "/ws/rest/v1/encountertype/t1": notFound });
    const { call } = await connect(client);
    const res = await call("get_encounters", { patientUuid: "p1", encounterTypeUuid: "t1" });
    expect(textOf(res)).toBe("No encounter type with UUID t1.");
    expect(client.calls).toHaveLength(2);
  });

  it("rejects a malformed date", async () => {
    const client = fakeClient({});
    const { call } = await connect(client);
    const res = await call("get_encounters", { patientUuid: "p1", fromDate: "01/02/2024" });
    expect(textOf(res)).toMatch(/^MCP error -32602: Input validation error/);
    expect(client.calls).toHaveLength(0);
  });

  it("describes the date format", async () => {
    const { listTools } = await connect(fakeClient({}));
    const tool = (await listTools()).find((t) => t.name === "get_encounters");
    expect(tool?.description).toContain("YYYY-MM-DD");
  });
});
