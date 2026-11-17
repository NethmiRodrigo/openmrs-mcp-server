import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { CallToolResult, Tool } from "@modelcontextprotocol/sdk/types.js";
import type { OpenMrsClient } from "../../src/openmrs/client.js";
import { createServer } from "../../src/server.js";

export async function connect(client: OpenMrsClient): Promise<{
  call(name: string, args: object): Promise<CallToolResult>;
  listTools(): Promise<Tool[]>;
}> {
  const server = createServer(async () => client);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const sdkClient = new Client({ name: "test", version: "0.0.0" });
  await Promise.all([server.connect(serverTransport), sdkClient.connect(clientTransport)]);
  return {
    async call(name, args) {
      return (await sdkClient.callTool({ name, arguments: args as Record<string, unknown> })) as CallToolResult;
    },
    async listTools() {
      return (await sdkClient.listTools()).tools;
    },
  };
}
