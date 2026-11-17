import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ConfigError, loadConfig } from "./config.js";
import { OpenMrsClient } from "./openmrs/client.js";
import { createServer } from "./server.js";

try {
  const client = new OpenMrsClient(loadConfig(process.env));
  await createServer(async () => client).connect(new StdioServerTransport());
} catch (error) {
  if (error instanceof ConfigError) {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }
  throw error;
}
