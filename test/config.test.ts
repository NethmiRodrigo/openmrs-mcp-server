import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig } from "../src/config.js";

const valid = {
  OPENMRS_URL: "https://h/openmrs",
  OPENMRS_USERNAME: "admin",
  OPENMRS_PASSWORD: "secret",
};

describe("loadConfig", () => {
  it("strips trailing slashes", () => {
    const config = loadConfig({ ...valid, OPENMRS_URL: "https://h/openmrs//" });
    expect(config.baseUrl).toBe("https://h/openmrs");
    expect(config.username).toBe("admin");
    expect(config.password).toBe("secret");
  });

  it("rejects non-local http", () => {
    const env = { ...valid, OPENMRS_URL: "http://emr.example.org/openmrs" };
    expect(() => loadConfig(env)).toThrow(ConfigError);
    expect(() => loadConfig(env)).toThrow(/https:\/\//);
  });

  it.each([
    "http://localhost:8080/openmrs",
    "http://127.0.0.1/openmrs",
    "http://[::1]/openmrs",
  ])("allows local http: %s", (url) => {
    expect(() => loadConfig({ ...valid, OPENMRS_URL: url })).not.toThrow();
  });

  it("rejects colon in password", () => {
    const env = { ...valid, OPENMRS_PASSWORD: "a:b" };
    expect(() => loadConfig(env)).toThrow(ConfigError);
    expect(() => loadConfig(env)).toThrow(/':'/);
  });

  it.each(["OPENMRS_URL", "OPENMRS_USERNAME", "OPENMRS_PASSWORD"])(
    "requires %s",
    (name) => {
      const env: Record<string, string | undefined> = { ...valid };
      delete env[name];
      expect(() => loadConfig(env)).toThrow(ConfigError);
      expect(() => loadConfig(env)).toThrow(new RegExp(name));
      expect(() => loadConfig({ ...env, [name]: "" })).toThrow(new RegExp(name));
    },
  );

  it("rejects unparseable url", () => {
    expect(() => loadConfig({ ...valid, OPENMRS_URL: "not a url" })).toThrow(ConfigError);
  });
});
