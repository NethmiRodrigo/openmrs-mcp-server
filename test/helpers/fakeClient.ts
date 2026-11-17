import type { GetResult, OpenMrsClient } from "../../src/openmrs/client.js";
import { OpenMrsError } from "../../src/openmrs/errors.js";
import type { Query } from "../../src/openmrs/url.js";

export type FakeClient = OpenMrsClient & { calls: { path: string; query?: Query }[] };

export function fakeClient(routes: Record<string, GetResult | OpenMrsError>): FakeClient {
  const calls: { path: string; query?: Query }[] = [];
  const client = {
    baseUrl: "https://example.org/openmrs",
    calls,
    async get(path: string, query?: Query): Promise<GetResult> {
      calls.push({ path, query });
      const route = routes[path];
      if (route === undefined) throw new Error(`Unexpected path: ${path}`);
      if (route instanceof OpenMrsError) throw route;
      return route;
    },
  };
  return client as unknown as FakeClient;
}
