#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { CONSTANTS } from "./constants.js";
import { loadTools, createToolsMap } from "./utils/toolLoader.js";

const { PROJECT_NAME, PROJECT_VERSION } = CONSTANTS;

let toolsMap: Map<string, any>;

const server = new Server(
  {
    name: PROJECT_NAME,
    version: PROJECT_VERSION,
  },
  {
    capabilities: {
      tools: {
        enabled: true,
      },
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  if (!toolsMap || toolsMap.size === 0) {
    console.warn("No tools available for listing");
    return { tools: [] };
  }
  return {
    tools: Array.from(toolsMap.values()).map((tool) => tool.toolDefinition),
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (!toolsMap) {
    throw new Error("Tools not initialized");
  }

  const tool = toolsMap.get(request.params.name);
  if (!tool) {
    throw new Error(
      `Unknown tool: ${request.params.name}. Available tools: ${Array.from(
        toolsMap.keys()
      ).join(", ")}`
    );
  }
  return tool.toolCall(request);
});

async function main() {
  try {
    console.log("Starting Coincap MCP Server...");

    const tools = await loadTools();
    if (tools.length === 0) {
      console.error("No tools were loaded! Server may not function correctly.");
    }

    toolsMap = createToolsMap(tools);
    console.log(
      `Initialized with ${tools.length} tools:`,
      Array.from(toolsMap.keys()).join(", ")
    );

    const transport = new StdioServerTransport();
    console.log("Connecting to transport...");
    await server.connect(transport);
    console.log("Server started successfully!");
  } catch (error) {
    console.error("Fatal error during server initialization:", error);
    process.exit(1);
  }
}

process.on("unhandledRejection", (error) => {
  console.error("Unhandled promise rejection:", error);
});

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
