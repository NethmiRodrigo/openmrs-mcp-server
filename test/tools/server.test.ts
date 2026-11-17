import { describe, expect, it } from "vitest";
import { fakeClient } from "../helpers/fakeClient.js";
import { connect } from "../helpers/connect.js";

const EXPECTED_TOOLS = ["openmrs_request", "search_patients", "search_concepts"];

describe("server", () => {
  it("registers the expected read-only tools", async () => {
    const { listTools } = await connect(fakeClient({}));
    const tools = await listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([...EXPECTED_TOOLS].sort());
    for (const tool of tools) expect(tool.annotations?.readOnlyHint).toBe(true);
  });
});
