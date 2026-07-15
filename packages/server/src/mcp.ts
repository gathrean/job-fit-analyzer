import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";

/**
 * The backend acts as an MCP *client*: it spawns the MCP server (packages/mcp-server)
 * as a child process over stdio and calls its tools. Claude never talks to the MCP
 * server directly — the backend brokers every tool call inside the agentic loop.
 *
 * Run `npm run build:mcp` before starting the server so dist/index.js exists.
 */

let clientPromise: Promise<Client> | null = null;

function getClient(): Promise<Client> {
  if (!clientPromise) {
    const serverPath = fileURLToPath(
      new URL("../../mcp-server/dist/index.js", import.meta.url),
    );
    const transport = new StdioClientTransport({
      command: "node",
      args: [serverPath],
    });
    const client = new Client({ name: "job-fit-server", version: "0.1.0" });
    clientPromise = client.connect(transport).then(() => client);
  }
  return clientPromise;
}

/** Tool definitions in MCP's shape (JSON Schema inputs). */
export async function getMcpTools() {
  const client = await getClient();
  const { tools } = await client.listTools();
  return tools;
}

/** Invoke a tool and flatten its content blocks to a string. */
export async function callMcpTool(
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  const client = await getClient();
  const res = await client.callTool({ name, arguments: args });
  const content = (res.content ?? []) as Array<{ type: string; text?: string }>;
  return content
    .map((block) => (block.type === "text" ? block.text ?? "" : JSON.stringify(block)))
    .join("\n");
}
