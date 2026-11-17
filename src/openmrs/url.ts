import { OpenMrsError } from "./errors.js";

export type Query = Record<string, string | number | boolean | undefined>;

export function buildUrl(baseUrl: string, path: string, query?: Query): URL {
  const rejected = () =>
    new OpenMrsError(
      "invalid_path",
      `Path not allowed: ${path}. Only paths under /ws/rest/ and /ws/fhir2/ are allowed.`,
    );

  if (/^[a-z][a-z0-9+.-]*:/i.test(path) || path.startsWith("//")) {
    throw rejected();
  }

  const base = new URL(baseUrl);
  const basePath = base.pathname.replace(/\/+$/, "");

  let url: URL;
  try {
    url = new URL(`${baseUrl}/${path.replace(/^\/+/, "")}`);
  } catch {
    throw rejected();
  }

  if (
    url.origin !== base.origin ||
    !(
      url.pathname.startsWith(`${basePath}/ws/rest/`) ||
      url.pathname.startsWith(`${basePath}/ws/fhir2/`)
    )
  ) {
    throw rejected();
  }

  // Tomcat strips ";..." path parameters before resolving "..", so "..;" escapes the prefix.
  if (/;|%3b/i.test(url.pathname)) {
    throw rejected();
  }

  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}
