import { describe, expect, it, vi } from "vitest";
import { OpenMrsClient } from "../src/openmrs/client.js";
import { OpenMrsError } from "../src/openmrs/errors.js";

const BASE = "https://h.org/openmrs";
const SESSION = `${BASE}/ws/rest/v1/session`;
const LOGIN_COPY =
  "Login failed. Check the username and password in the extension settings. Passwords that contain ':' and instances with two-factor login are not supported.";
const NETWORK_COPY = `Could not read a JSON response from ${BASE}. Check openmrs_url in the extension settings; it must include the webapp path, e.g. https://host/openmrs.`;

type Handler = (url: string, init: RequestInit) => Response | Promise<Response>;

function json(status: number, body: unknown, statusText = ""): Response {
  return new Response(JSON.stringify(body), {
    status,
    statusText,
    headers: { "content-type": "application/json" },
  });
}

function html(status: number, body: string): Response {
  return new Response(body, { status, headers: { "content-type": "text/html" } });
}

function setup(
  handler: Handler,
  config = { baseUrl: BASE, username: "admin", password: "Admin123" },
) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init: init ?? {} });
    return handler(url, init ?? {});
  }) as unknown as typeof fetch;
  return { client: new OpenMrsClient(config, fetchImpl), calls };
}

const sessionOk = () => json(200, { authenticated: true });

function withSession(target: () => Response): Handler {
  return (url) => (url === SESSION ? sessionOk() : target());
}

async function rejection(p: Promise<unknown>): Promise<OpenMrsError> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(OpenMrsError);
    return e as OpenMrsError;
  }
  throw new Error("expected rejection");
}

const sessionCalls = (calls: { url: string }[]) => calls.filter((c) => c.url === SESSION).length;

describe("OpenMrsClient", () => {
  it("exposes baseUrl", () => {
    const { client } = setup(sessionOk);
    expect(client.baseUrl).toBe(BASE);
  });

  it("sends basic auth and accept json", async () => {
    const { client, calls } = setup(withSession(() => json(200, { results: [] })));
    await client.get("/ws/rest/v1/visit", { limit: 5 });
    const headers = calls[1].init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(
      "Basic " + Buffer.from("admin:Admin123", "utf8").toString("base64"),
    );
    expect(headers.Accept).toBe("application/json");
    expect(calls[1].url).toBe(`${BASE}/ws/rest/v1/visit?limit=5`);
  });

  it("encodes utf-8 credentials", async () => {
    const { client, calls } = setup(withSession(() => json(200, {})), {
      baseUrl: BASE,
      username: "admin",
      password: "pässwörd",
    });
    await client.get("/ws/rest/v1/visit");
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(
      "Basic " + Buffer.from("admin:pässwörd", "utf8").toString("base64"),
    );
  });

  it("only uses GET and manual redirect", async () => {
    const { client, calls } = setup(withSession(() => json(200, {})));
    await client.get("/ws/rest/v1/visit");
    expect(calls.length).toBe(2);
    for (const c of calls) {
      expect(c.init.method === undefined || c.init.method === "GET").toBe(true);
      expect(c.init.redirect).toBe("manual");
    }
  });

  it("checks session once before first call", async () => {
    const { client, calls } = setup(withSession(() => json(200, {})));
    await client.get("/ws/rest/v1/visit");
    await client.get("/ws/rest/v1/visit");
    expect(calls.map((c) => c.url)).toEqual([
      SESSION,
      `${BASE}/ws/rest/v1/visit`,
      `${BASE}/ws/rest/v1/visit`,
    ]);
  });

  it("dedupes concurrent login checks", async () => {
    const { client, calls } = setup(withSession(() => json(200, {})));
    await Promise.all(Array.from({ length: 5 }, () => client.get("/ws/rest/v1/visit")));
    expect(sessionCalls(calls)).toBe(1);
  });

  it("latches on authenticated false", async () => {
    const { client, calls } = setup(() => json(200, { authenticated: false }));
    const first = await rejection(client.get("/ws/rest/v1/visit"));
    expect(first.kind).toBe("login");
    expect(first.message).toBe(LOGIN_COPY);
    const before = calls.length;
    const second = await rejection(client.get("/ws/rest/v1/visit"));
    expect(second.kind).toBe("login");
    expect(second.message).toBe(LOGIN_COPY);
    expect(calls.length).toBe(before);
  });

  it("does not latch on network error", async () => {
    let n = 0;
    const { client, calls } = setup((url) => {
      if (url === SESSION) {
        if (n++ === 0) throw new TypeError("fetch failed");
        return sessionOk();
      }
      return json(200, {});
    });
    const err = await rejection(client.get("/ws/rest/v1/visit"));
    expect(err.kind).toBe("network");
    await expect(client.get("/ws/rest/v1/visit")).resolves.toEqual({ status: 200, body: {} });
    expect(sessionCalls(calls)).toBe(2);
  });

  it("does not latch on 5xx session", async () => {
    let n = 0;
    const { client, calls } = setup((url) => {
      if (url === SESSION) return n++ === 0 ? json(503, { error: { message: "down" } }) : sessionOk();
      return json(200, {});
    });
    const err = await rejection(client.get("/ws/rest/v1/visit"));
    expect(err.kind).toBe("server");
    await client.get("/ws/rest/v1/visit");
    expect(sessionCalls(calls)).toBe(2);
  });

  it("does not latch on non-JSON session", async () => {
    let n = 0;
    const { client, calls } = setup((url) => {
      if (url === SESSION) return n++ === 0 ? html(200, "<html>") : sessionOk();
      return json(200, {});
    });
    const err = await rejection(client.get("/ws/rest/v1/visit"));
    expect(err.kind).toBe("network");
    await client.get("/ws/rest/v1/visit");
    expect(sessionCalls(calls)).toBe(2);
  });

  it("does not leave a rejected promise cached after concurrent failures", async () => {
    let n = 0;
    const { client, calls } = setup((url) => {
      if (url === SESSION) {
        if (n++ === 0) throw new TypeError("fetch failed");
        return sessionOk();
      }
      return json(200, {});
    });
    const results = await Promise.allSettled([
      client.get("/ws/rest/v1/visit"),
      client.get("/ws/rest/v1/visit"),
    ]);
    expect(results.every((r) => r.status === "rejected")).toBe(true);
    expect(sessionCalls(calls)).toBe(1);
    await expect(client.get("/ws/rest/v1/visit")).resolves.toEqual({ status: 200, body: {} });
    expect(sessionCalls(calls)).toBe(2);
  });

  it("network error on a normal call", async () => {
    let target = 0;
    const { client, calls } = setup((url) => {
      if (url === SESSION) return sessionOk();
      if (target++ === 0) throw new TypeError("fetch failed");
      return json(200, {});
    });
    const err = await rejection(client.get("/ws/rest/v1/visit"));
    expect(err.kind).toBe("network");
    expect(err.message).toContain("openmrs_url");
    expect(err.message).toBe(NETWORK_COPY);
    await client.get("/ws/rest/v1/visit");
    expect(sessionCalls(calls)).toBe(1);
  });

  describe("status mapping", () => {
    const run = (res: () => Response, path = "/ws/rest/v1/visit/abc") => {
      const { client } = setup(withSession(res));
      return rejection(client.get(path));
    };

    it("400", async () => {
      const err = await run(() =>
        json(400, { error: { message: "Invalid date", detail: "java.lang.Exception" } }),
      );
      expect(err.kind).toBe("bad_request");
      expect(err.status).toBe(400);
      expect(err.message).toBe("Bad request: Invalid date.");
    });

    it("401", async () => {
      const err = await run(() => json(401, { error: { message: "x" } }));
      expect(err.kind).toBe("login");
      expect(err.message).toBe(LOGIN_COPY);
    });

    it("401 with non-JSON body still maps to login", async () => {
      const err = await run(() => html(401, "<html>"));
      expect(err.kind).toBe("login");
      expect(err.message).toBe(LOGIN_COPY);
    });

    it("403", async () => {
      const err = await run(() => json(403, { error: { message: "Privileges required: X" } }));
      expect(err.kind).toBe("forbidden");
      expect(err.message).toBe(
        "The OpenMRS user does not have the privilege to read this: Privileges required: X.",
      );
    });

    it("404", async () => {
      const err = await run(() => json(404, { error: { message: "Object with given uuid doesn't exist" } }));
      expect(err.kind).toBe("not_found");
      expect(err.message).toBe("Not found: /ws/rest/v1/visit/abc.");
    });

    it("500 never leaks detail", async () => {
      const err = await run(() =>
        json(500, { error: { message: "boom", detail: "at org.openmrs.Foo.bar(Foo.java:1)" } }),
      );
      expect(err.kind).toBe("server");
      expect(err.message).toBe("OpenMRS server error: boom.");
      expect(err.message).not.toContain("at org.openmrs");
    });

    it("falls back to status text, then to a standard reason phrase", async () => {
      const a = await run(() => json(500, {}, "Internal Server Error"));
      expect(a.message).toBe("OpenMRS server error: Internal Server Error.");
      const b = await run(() => json(500, {}));
      expect(b.message).toBe("OpenMRS server error: Internal Server Error.");
    });

    it("302 with Location", async () => {
      const err = await run(
        () => new Response(null, { status: 302, headers: { Location: "https://x/login" } }),
      );
      expect(err.kind).toBe("redirect");
      expect(err.message).toBe(
        "OpenMRS answered with a redirect (302) to https://x/login. Check openmrs_url in the extension settings.",
      );
    });

    it("302 without Location", async () => {
      const err = await run(() => new Response(null, { status: 302 }));
      expect(err.kind).toBe("redirect");
      expect(err.message).toContain("to (none).");
    });
  });

  it("200 with error body is an error", async () => {
    const { client } = setup(withSession(() => json(200, { error: { message: "NoClassDefFoundError" } })));
    const err = await rejection(client.get("/ws/rest/v1/visit"));
    expect(err.kind).toBe("server");
    expect(err.message).toBe("OpenMRS server error: NoClassDefFoundError.");
  });

  it("200 with stackTrace body and no error is an error", async () => {
    const { client } = setup(withSession(() => json(200, { stackTrace: [] }, "OK")));
    const err = await rejection(client.get("/ws/rest/v1/visit"));
    expect(err.kind).toBe("server");
    expect(err.message).toBe("OpenMRS server error: OK.");
  });

  it("html body maps to network message", async () => {
    const { client } = setup(withSession(() => html(200, "<html>")));
    const err = await rejection(client.get("/ws/rest/v1/visit"));
    expect(err.kind).toBe("network");
    expect(err.message).toContain("openmrs_url");
  });

  it("html 404 maps to network message", async () => {
    const { client } = setup(withSession(() => html(404, "<html>nginx</html>")));
    const err = await rejection(client.get("/ws/rest/v1/visit"));
    expect(err.kind).toBe("network");
  });

  it("204 returns no content", async () => {
    const { client } = setup(withSession(() => new Response(null, { status: 204 })));
    await expect(client.get("/ws/rest/v1/visit")).resolves.toEqual({ status: 204 });
  });

  it("returns parsed body on 200", async () => {
    const { client } = setup(withSession(() => json(200, { results: [1] })));
    await expect(client.get("/ws/rest/v1/visit")).resolves.toEqual({
      status: 200,
      body: { results: [1] },
    });
  });

  it("invalid path does not fetch", async () => {
    const { client, calls } = setup(sessionOk);
    const err = await rejection(client.get("https://evil.com/x"));
    expect(err.kind).toBe("invalid_path");
    expect(calls.length).toBe(0);
  });
});
