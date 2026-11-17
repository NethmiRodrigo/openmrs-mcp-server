import { describe, expect, it } from "vitest";
import { OpenMrsError } from "../src/openmrs/errors.js";
import { buildUrl } from "../src/openmrs/url.js";

const base = "https://h.org/openmrs";

function expectRejected(path: string): void {
  try {
    buildUrl(base, path);
  } catch (error) {
    expect(error).toBeInstanceOf(OpenMrsError);
    expect((error as OpenMrsError).kind).toBe("invalid_path");
    expect((error as OpenMrsError).message).toBe(
      `Path not allowed: ${path}. Only paths under /ws/rest/ and /ws/fhir2/ are allowed.`,
    );
    return;
  }
  throw new Error(`expected rejection for ${JSON.stringify(path)}`);
}

describe("buildUrl", () => {
  it("builds rest url", () => {
    const url = buildUrl(base, "/ws/rest/v1/patient", { q: "john", limit: 5 });
    expect(url.href).toBe("https://h.org/openmrs/ws/rest/v1/patient?q=john&limit=5");
  });

  it("skips undefined query values", () => {
    const url = buildUrl(base, "/ws/rest/v1/patient", { a: undefined, b: "x" });
    expect(url.search).toBe("?b=x");
  });

  it("encodes plus in dates", () => {
    const url = buildUrl(base, "/ws/rest/v1/obs", { fromdate: "2026-01-01T00:00:00+05:30" });
    expect(url.search).toContain("%2B05%3A30");
  });

  it("allows fhir", () => {
    expect(buildUrl(base, "/ws/fhir2/R4/Patient").href).toBe(
      "https://h.org/openmrs/ws/fhir2/R4/Patient",
    );
  });

  it("accepts a path without leading slash", () => {
    expect(buildUrl(base, "ws/rest/v1/patient").href).toBe(
      "https://h.org/openmrs/ws/rest/v1/patient",
    );
  });

  it("root base url", () => {
    expect(buildUrl("https://h.org", "/ws/rest/v1/session").href).toBe(
      "https://h.org/ws/rest/v1/session",
    );
  });

  it.each([
    "https://evil.com/ws/rest/v1/x",
    "//evil.com/ws/rest/v1/x",
    "/ws/rest/v1/../../admin",
    "/ws/rest/v1/%2e%2e/%2e%2e/%2e%2e/admin/x",
    "/ws/rest/v1/%2E%2E/%2E%2E/%2E%2E/x",
    "/ws/rest/v1\\..\\..\\..\\x",
    "/ws/rest/v1/\t../../../x",
    "/ws/rest/v1/\n../../../x",
    "/module/webservices/rest/swagger.json",
    "/admin/index.htm",
  ])("rejects %j", (path) => {
    expectRejected(path);
  });

  it("rejects traversal out of a root base url", () => {
    expect(() => buildUrl("https://h.org", "/ws/rest/../admin")).toThrow(OpenMrsError);
  });

  it("rejects traversal into a sibling prefix of the base path", () => {
    expect(() => buildUrl(base, "/ws/rest/v1/../../../openmrs2/ws/rest/x")).toThrow(OpenMrsError);
  });
});
