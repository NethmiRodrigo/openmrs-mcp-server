import { describe, expect, it } from "vitest";
import { OpenMrsError } from "../../src/openmrs/errors.js";
import { assertExists, fail, limitArg, listPage, seg } from "../../src/tools/common.js";
import { fakeClient } from "../helpers/fakeClient.js";

describe("common helpers", () => {
  it("clamps limit", () => {
    const arg = limitArg(10);
    expect(arg.parse(0)).toBe(1);
    expect(arg.parse(-5)).toBe(1);
    expect(arg.parse(500)).toBe(100);
    expect(arg.parse(undefined)).toBe(10);
  });

  it("encodes uuid path segments", () => {
    expect(seg("a/../b?x")).toBe("a%2F..%2Fb%3Fx");
  });

  it("listPage sends totalCount=true, limit and startIndex", async () => {
    const client = fakeClient({ "/ws/rest/v1/thing": { status: 200, body: { results: [{ a: 1 }] } } });
    const page = await listPage(client, "/ws/rest/v1/thing", { v: "custom:(uuid)" }, 5, 10);
    expect(client.calls[0]).toEqual({
      path: "/ws/rest/v1/thing",
      query: { v: "custom:(uuid)", limit: 5, startIndex: 10, totalCount: true },
    });
    expect(page).toEqual({ results: [{ a: 1 }], startIndex: 10 });
  });

  it("listPage turns 204 into an empty page", async () => {
    const client = fakeClient({ "/ws/rest/v1/thing": { status: 204 } });
    expect(await listPage(client, "/ws/rest/v1/thing", {}, 5, 3)).toEqual({ results: [], startIndex: 3 });
  });

  it("listPage rejects a 200 body without a results list", async () => {
    const client = fakeClient({ "/ws/rest/v1/thing": { status: 200, body: {} } });
    await expect(listPage(client, "/ws/rest/v1/thing", {}, 5, 0)).rejects.toMatchObject({
      kind: "server",
      message: "OpenMRS server error: the response has no results list.",
    });
  });

  it("assertExists maps 404 to the given message", async () => {
    const client = fakeClient({
      "/ws/rest/v1/patient/x": new OpenMrsError("not_found", "Not found: /ws/rest/v1/patient/x.", 404),
    });
    await expect(assertExists(client, "/ws/rest/v1/patient/x", "No patient with UUID x.")).rejects.toMatchObject({
      kind: "not_found",
      message: "No patient with UUID x.",
    });
    expect(client.calls[0]?.query).toEqual({ v: "custom:(uuid)" });
  });

  it("assertExists rethrows other errors unchanged", async () => {
    const err = new OpenMrsError("server", "OpenMRS server error: boom.", 500);
    const client = fakeClient({ "/p": err });
    await expect(assertExists(client, "/p", "nope")).rejects.toBe(err);
  });

  it("fail never leaks non-OpenMrsError internals", () => {
    expect(fail(new TypeError("x"))).toEqual({
      isError: true,
      content: [{ type: "text", text: "Internal error: x" }],
    });
    expect(fail(new OpenMrsError("login", "Login failed."))).toEqual({
      isError: true,
      content: [{ type: "text", text: "Login failed." }],
    });
  });
});
