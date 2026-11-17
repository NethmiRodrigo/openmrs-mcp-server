export interface Config {
  baseUrl: string; // no trailing slash
  username: string;
  password: string;
}

export class ConfigError extends Error {}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function required(env: Record<string, string | undefined>, name: string): string {
  const value = env[name];
  if (!value) {
    throw new ConfigError(`${name} is required.`);
  }
  return value;
}

export function loadConfig(env: Record<string, string | undefined>): Config {
  const rawUrl = required(env, "OPENMRS_URL");
  const username = required(env, "OPENMRS_USERNAME");
  const password = required(env, "OPENMRS_PASSWORD");

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new ConfigError(`OPENMRS_URL is not a valid URL: ${rawUrl}`);
  }

  if (url.protocol !== "https:" && !(url.protocol === "http:" && LOCAL_HOSTS.has(url.hostname))) {
    throw new ConfigError(
      "OPENMRS_URL must use https:// (http:// is allowed only for localhost, 127.0.0.1 and [::1]).",
    );
  }

  if (password.includes(":")) {
    throw new ConfigError("OPENMRS_PASSWORD must not contain ':' (not supported by Basic authentication here).");
  }

  return { baseUrl: rawUrl.replace(/\/+$/, ""), username, password };
}
