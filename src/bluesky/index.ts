import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";

const server = new Server({
  name: "mcp-bluesky",
  version: "1.0.0",
}, {
  capabilities: {
    tools: {}
  }
});

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: [] };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "name_of_tool") {
    return {};
  }
  throw new McpError(ErrorCode.TOOL_NOT_FOUND, "Tool not found");
});

const transport = new StdioServerTransport();
await server.connect(transport);

// Define and Add Tools
// Define a tool schema and its execution logic.
// For example, to add a tool that calculates the sum of two numbers.

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [{
      name: "calculate_sum",
      description: "Add two numbers together",
      inputSchema: {
        type: "object",
        properties: {
          a: { type: "number" },
          b: { type: "number" }
        },
        required: ["a", "b"]
      }
    }]
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "calculate_sum") {
    const { a, b } = request.params.arguments;
    return { toolResult: a + b };
  }
  throw new McpError(ErrorCode.TOOL_NOT_FOUND, "Tool not found");
});