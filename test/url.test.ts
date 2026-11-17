import { describe, expect, it } from "vitest";
import { OpenMrsError } from "../src/openmrs/errors.js";
import { buildUrl } from "../src/openmrs/url.js";

const base = "https://h.org/openmrs";

function expectRejected(path: string, baseUrl: string = base): void {
  try {
    buildUrl(baseUrl, path);
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
    expectRejected("/ws/rest/../admin", "https://h.org");
  });

  it("rejects traversal into a sibling prefix of the base path", () => {
    expectRejected("/ws/rest/v1/../../../openmrs2/ws/rest/x");
  });

  it.each([
    "/ws/rest/v1/..;/..;/..;/admin",
    "/ws/rest/v1/patient;jsessionid=x",
    "/ws/rest/v1/%3B/x",
    "/ws/rest/v1/%3b/x",
  ])("rejects path parameters %j", (path) => {
    expectRejected(path);
  });

  it.each([
    "/ws/rest/v1/..%2f..%2fadmin/index.htm",
    "/ws/rest/v1/..%2F..%2Fadmin",
    "/ws/rest/v1/x%5c..%5cadmin",
    "/ws/rest/v1/x%5C..%5Cadmin",
  ])("rejects encoded slash and backslash %j", (path) => {
    expectRejected(path);
  });
});
