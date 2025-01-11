#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import fetch from "node-fetch";
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import {
  CreateProjectInputSchema,
  ListProjectsInputSchema,
  GetProjectInputSchema,
  DeleteProjectInputSchema,
  type SupabaseResponse,
  type Project,
  type Organization,
  ListOrganizationsInputSchema,
  GetOrganizationInputSchema,
  CreateOrganizationInputSchema,
  UpdateOrganizationInputSchema,
  ProjectApiKey,
  GetProjectApiKeysInputSchema,
} from './schemas.js';

// Configuration
const SUPABASE_API_URL = 'https://api.supabase.com/v1';

class SupabaseAPI {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async makeRequest(endpoint: string, method: string = 'GET', body?: any): Promise<any> {
    const response = await fetch(`${SUPABASE_API_URL}${endpoint}`, {
      method,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      throw new Error(`Supabase API error: ${response.statusText}`);
    }

    return response.json();
  }

  async listProjects(ref?: string): Promise<Project[]> {
    return this.makeRequest('/projects' + (ref ? `?ref=${ref}` : ''));
  }

  async getProject(ref: string): Promise<Project> {
    return this.makeRequest(`/projects/${ref}`);
  }

  async createProject(data: any): Promise<Project> {
    return this.makeRequest('/projects', 'POST', data);
  }

  async deleteProject(ref: string): Promise<void> {
    return this.makeRequest(`/projects/${ref}`, 'DELETE');
  }

  async listOrganizations(): Promise<Organization[]> {
    return this.makeRequest('/organizations');
  }

  async getOrganization(slug: string): Promise<Organization> {
    return this.makeRequest(`/organizations/${slug}`);
  }

  async createOrganization(data: any): Promise<Organization> {
    return this.makeRequest('/organizations', 'POST', data);
  }

  async getProjectApiKeys(ref: string): Promise<ProjectApiKey[]> {
    return this.makeRequest(`/projects/${ref}/api-keys`);
  }
}

// Initialize server and API client
const apiKey = process.env.SUPABASE_API_KEY;
if (!apiKey) {
  throw new Error('SUPABASE_API_KEY environment variable is required');
}

const supabase = new SupabaseAPI(apiKey);
const server = new Server({
  name: "supabase-mcp",
  version: "1.0.0",
}, {
  capabilities: {
    tools: {}
  }
});

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "list_projects",
        description: "List all Supabase projects",
        inputSchema: zodToJsonSchema(ListProjectsInputSchema)
      },
      {
        name: "get_project",
        description: "Get details of a specific Supabase project",
        inputSchema: zodToJsonSchema(GetProjectInputSchema)
      },
      {
        name: "create_project",
        description: "Create a new Supabase project",
        inputSchema: zodToJsonSchema(CreateProjectInputSchema)
      },
      {
        name: "delete_project",
        description: "Delete a Supabase project",
        inputSchema: zodToJsonSchema(DeleteProjectInputSchema)
      },
      {
        name: "list_organizations",
        description: "List all organizations",
        inputSchema: zodToJsonSchema(ListOrganizationsInputSchema)
      },
      {
        name: "get_organization",
        description: "Get details of a specific organization",
        inputSchema: zodToJsonSchema(GetOrganizationInputSchema)
      },
      {
        name: "create_organization",
        description: "Create a new organization",
        inputSchema: zodToJsonSchema(CreateOrganizationInputSchema)
      },
      {
        name: "get_project_api_keys",
        description: "Get API keys for a specific Supabase project",
        inputSchema: zodToJsonSchema(GetProjectApiKeysInputSchema)
      }
    ]
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    if (!request.params.arguments) {
      throw new Error("Arguments are required");
    }

    switch (request.params.name) {
      case "list_projects": {
        const args = ListProjectsInputSchema.parse(request.params.arguments);
        const result = await supabase.listProjects(args.ref);
        return { toolResult: result };
      }
      case "get_project": {
        const args = GetProjectInputSchema.parse(request.params.arguments);
        const result = await supabase.getProject(args.ref);
        return { toolResult: result };
      }
      case "create_project": {
        const args = CreateProjectInputSchema.parse(request.params.arguments);
        const result = await supabase.createProject(args);
        return { toolResult: result };
      }
      case "delete_project": {
        const args = DeleteProjectInputSchema.parse(request.params.arguments);
        await supabase.deleteProject(args.ref);
        return { toolResult: { success: true } };
      }
      case "list_organizations": {
        const result = await supabase.listOrganizations();
        return { toolResult: result };
      }
      case "get_organization": {
        const args = GetOrganizationInputSchema.parse(request.params.arguments);
        const result = await supabase.getOrganization(args.slug);
        return { toolResult: result };
      }
      case "create_organization": {
        const args = CreateOrganizationInputSchema.parse(request.params.arguments);
        const result = await supabase.createOrganization(args);
        return { toolResult: result };
      }
      case "get_project_api_keys": {
        const args = GetProjectApiKeysInputSchema.parse(request.params.arguments);
        const result = await supabase.getProjectApiKeys(args.ref);
        if (args.name) {
          const filtered = result.filter(key => key.name === args.name);
          return { toolResult: filtered };
        }
        return { toolResult: result };
      }
      default:
        throw new Error(`Unknown tool: ${request.params.name}`);
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`Invalid arguments: ${error.message}`);
    }
    throw error;
  }
});

// Start the server
async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Supabase MCP Server running on stdio");
}

runServer().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
