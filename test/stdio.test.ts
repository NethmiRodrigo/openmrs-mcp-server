import { execFileSync, spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { beforeAll, expect, it } from "vitest";

const root = new URL("..", import.meta.url).pathname;

beforeAll(() => {
  rmSync(`${root}dist`, { recursive: true, force: true });
  execFileSync("npm", ["run", "build"], { cwd: root, stdio: "pipe" });
}, 60_000);

it("exits non-zero and asks for https:// when the URL is not https", () => {
  const result = spawnSync("node", ["dist/stdio.js"], {
    cwd: root,
    encoding: "utf8",
    timeout: 5000,
    env: {
      PATH: process.env.PATH,
      OPENMRS_URL: "http://emr.example.org/openmrs",
      OPENMRS_USERNAME: "user",
      OPENMRS_PASSWORD: "pass",
    },
  });
  expect(result.status).not.toBe(0);
  expect(result.status).not.toBeNull();
  expect(result.stderr).toContain("https://");
});
