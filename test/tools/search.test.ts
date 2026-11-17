import { describe, expect, it } from "vitest";
import { fakeClient } from "../helpers/fakeClient.js";
import { connect } from "../helpers/connect.js";

describe("search tools", () => {
  it("search_patients queries /patient", async () => {
    const client = fakeClient({ "/ws/rest/v1/patient": { status: 200, body: { results: [{ uuid: "u" }] } } });
    const { call } = await connect(client);
    const res = await call("search_patients", { query: "jo" });
    expect(res.isError).toBeUndefined();
    const q = client.calls[0]!.query!;
    expect(client.calls[0]!.path).toBe("/ws/rest/v1/patient");
    expect(q).toMatchObject({ q: "jo", limit: 10, startIndex: 0, totalCount: true });
    expect(String(q.v).startsWith("custom:(uuid,display,")).toBe(true);
  });

  it("search_patients rejects a short query without calling the client", async () => {
    const client = fakeClient({});
    const { call } = await connect(client);
    const res = await call("search_patients", { query: " j " });
    expect(res.isError).toBe(true);
    expect(res.content).toEqual([{ type: "text", text: "The search query needs at least 2 characters." }]);
    expect(client.calls).toHaveLength(0);
  });

  it("search_patients description mentions the minimum", async () => {
    const { listTools } = await connect(fakeClient({}));
    const tool = (await listTools()).find((t) => t.name === "search_patients");
    expect(tool?.description).toContain("at least 2 characters");
  });

  it("search_patients rejects bad input via the schema", async () => {
    const { call } = await connect(fakeClient({}));
    const res = await call("search_patients", { query: "jo", limit: "x" });
    expect(res.isError).toBe(true);
    expect((res.content[0] as { text: string }).text).toMatch(/^MCP error -32602: Input validation error/);
  });

  it("search_concepts queries /concept", async () => {
    const client = fakeClient({ "/ws/rest/v1/concept": { status: 200, body: { results: [] } } });
    const { call } = await connect(client);
    await call("search_concepts", { query: "weight" });
    const q = client.calls[0]!.query!;
    expect(client.calls[0]!.path).toBe("/ws/rest/v1/concept");
    expect(q.q).toBe("weight");
    expect(String(q.v)).toContain("datatype");
    expect(String(q.v)).toContain("conceptClass");
  });
});
