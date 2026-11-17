import { createRequire } from "node:module";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { GetClient } from "./tools/common.js";
import { registerGetEncounters } from "./tools/getEncounters.js";
import { registerGetObservations } from "./tools/getObservations.js";
import { registerGetPatientSummary } from "./tools/getPatientSummary.js";
import { registerGetVisits } from "./tools/getVisits.js";
import { registerOpenmrsRequest } from "./tools/openmrsRequest.js";
import { registerSearchConcepts } from "./tools/searchConcepts.js";
import { registerSearchPatients } from "./tools/searchPatients.js";

const { version } = createRequire(import.meta.url)("../package.json") as { version: string };

export function createServer(getClient: GetClient): McpServer {
  const server = new McpServer({ name: "openmrs", version });
  registerOpenmrsRequest(server, getClient);
  registerSearchPatients(server, getClient);
  registerSearchConcepts(server, getClient);
  registerGetObservations(server, getClient);
  registerGetVisits(server, getClient);
  registerGetEncounters(server, getClient);
  registerGetPatientSummary(server, getClient);
  return server;
}
