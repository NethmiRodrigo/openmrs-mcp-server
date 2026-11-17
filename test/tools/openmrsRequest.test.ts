import { describe, expect, it } from "vitest";
import { OpenMrsError } from "../../src/openmrs/errors.js";
import { fakeClient } from "../helpers/fakeClient.js";
import { connect } from "../helpers/connect.js";

const text = (res: { content: unknown }) => (res.content as { text: string }[])[0]!.text;

describe("openmrs_request", () => {
  it("passes path and query through unchanged", async () => {
    const client = fakeClient({ "/ws/rest/v1/x": { status: 200, body: { a: 1 } } });
    const { call } = await connect(client);
    await call("openmrs_request", { path: "/ws/rest/v1/x", query: { limit: 500, v: "full" } });
    expect(client.calls[0]).toEqual({ path: "/ws/rest/v1/x", query: { limit: 500, v: "full" } });
  });

  it("returns a Page for responses with results", async () => {
    const results = Array.from({ length: 10 }, (_, i) => ({ i, links: [] }));
    const client = fakeClient({
      "/ws/rest/v1/x": { status: 200, body: { results, links: [{ rel: "next", uri: "u" }] } },
    });
    const { call } = await connect(client);
    const res = await call("openmrs_request", { path: "/ws/rest/v1/x", query: { startIndex: "20" } });
    const page = JSON.parse(text(res));
    expect(page.startIndex).toBe(20);
    expect(page.nextStartIndex).toBe(30);
    expect(page.results[0]).toEqual({ i: 0 });
  });

  it("strips links from responses without results", async () => {
    const client = fakeClient({
      "/ws/rest/v1/x": { status: 200, body: { uuid: "u", links: [{ rel: "self" }], inner: { links: [] } } },
    });
    const { call } = await connect(client);
    const res = await call("openmrs_request", { path: "/ws/rest/v1/x" });
    expect(JSON.parse(text(res))).toEqual({ uuid: "u", inner: {} });
  });

  it("reports 204", async () => {
    const client = fakeClient({ "/ws/rest/v1/x": { status: 204 } });
    const { call } = await connect(client);
    const res = await call("openmrs_request", { path: "/ws/rest/v1/x" });
    expect(text(res)).toBe("HTTP 204, no content");
  });

  it("surfaces client errors", async () => {
    const msg = "Path not allowed: /etc. Only paths under /ws/rest/ and /ws/fhir2/ are allowed.";
    const client = fakeClient({ "/etc": new OpenMrsError("invalid_path", msg) });
    const { call } = await connect(client);
    const res = await call("openmrs_request", { path: "/etc" });
    expect(res.isError).toBe(true);
    expect(text(res)).toBe(msg);
  });

  it("has no method argument", async () => {
    const { listTools } = await connect(fakeClient({}));
    const tool = (await listTools()).find((t) => t.name === "openmrs_request");
    expect(Object.keys(tool!.inputSchema.properties ?? {})).toEqual(["path", "query"]);
  });
});
