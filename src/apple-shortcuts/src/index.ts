#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  CallToolResult,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { execSync } from "child_process";

// Define the tools for Shortcuts interaction
const TOOLS: Tool[] = [
  {
    name: "run_shortcut",
    description: "Run a Shortcuts automation by name",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Name of the shortcut to run" },
        input: {
          type: "string",
          description: "Optional input to pass to the shortcut",
        },
      },
      required: ["name"],
    },
  },
  {
    name: "list_shortcuts",
    description: "List all available shortcuts",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
];

// Global state to track shortcuts
let availableShortcuts: string[] = [];

function updateShortcutsList() {
  try {
    const stdout = execSync("shortcuts list").toString();
    availableShortcuts = stdout
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  } catch (error) {
    console.error("Failed to list shortcuts:", error);
    availableShortcuts = [];
  }
}

async function handleToolCall(
  name: string,
  args: any
): Promise<CallToolResult> {
  switch (name) {
    case "list_shortcuts": {
      updateShortcutsList();
      console.error("MCP shortcuts: Listing shortcuts");
      return {
        content: [
          {
            type: "text",
            text: `Available shortcuts:\n${availableShortcuts.join("\n")}`,
          },
        ],
        isError: false,
      };
    }

    case "run_shortcut": {
      try {
        const command = args.input
          ? `shortcuts run "${args.name}" -i "${args.input}"`
          : `shortcuts run "${args.name}"`;

        console.error("MCP shortcuts: Running command:", command);
        const stdout = execSync(command).toString();

        return {
          content: [
            {
              type: "text",
              text: stdout || "Shortcut executed successfully",
            },
          ],
          isError: false,
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Failed to run shortcut: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }

    default:
      return {
        content: [
          {
            type: "text",
            text: `Unknown tool: ${name}`,
          },
        ],
        isError: true,
      };
  }
}

const server = new Server(
  {
    name: "recursechat/shortcuts",
    version: "1.0.1",
  },
  {
    capabilities: {
      resources: {},
      tools: {},
    },
  }
);

// Setup request handlers
server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: [
    {
      uri: "shortcuts://list",
      mimeType: "text/plain",
      name: "Available Shortcuts",
    },
  ],
}));

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const uri = request.params.uri.toString();

  if (uri === "shortcuts://list") {
    updateShortcutsList();
    return {
      contents: [
        {
          uri,
          mimeType: "text/plain",
          text: availableShortcuts.join("\n"),
        },
      ],
    };
  }

  throw new Error(`Resource not found: ${uri}`);
});

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) =>
  handleToolCall(request.params.name, request.params.arguments ?? {})
);

async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Initial shortcuts list update
  updateShortcutsList();
}

runServer().catch(console.error);
