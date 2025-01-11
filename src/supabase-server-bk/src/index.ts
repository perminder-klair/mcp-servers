#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Get Supabase credentials from environment variables
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error('SUPABASE_URL and SUPABASE_KEY environment variables are required');
}

class SupabaseServer {
  private server: Server;
  private supabase: SupabaseClient;

  constructor() {
    this.server = new Server(
      {
        name: 'supabase-server',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // We can safely assert these are defined since we check above
    this.supabase = createClient(SUPABASE_URL!, SUPABASE_KEY!);

    this.setupToolHandlers();

    // Error handling
    this.server.onerror = (error) => console.error('[MCP Error]', error);
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'execute_sql',
          description: 'Execute a raw SQL query',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'SQL query to execute',
              }
            },
            required: ['query'],
          },
        },
        {
          name: 'query_data',
          description: 'Query data from a Supabase table with optional filters',
          inputSchema: {
            type: 'object',
            properties: {
              table: {
                type: 'string',
                description: 'Name of the table to query',
              },
              select: {
                type: 'string',
                description: 'Columns to select (comma-separated). Use * for all columns.',
              },
              filters: {
                type: 'object',
                description: 'Optional filter conditions',
                additionalProperties: true,
              },
              limit: {
                type: 'number',
                description: 'Maximum number of rows to return',
              },
            },
            required: ['table', 'select'],
          },
        },
        {
          name: 'insert_data',
          description: 'Insert data into a Supabase table',
          inputSchema: {
            type: 'object',
            properties: {
              table: {
                type: 'string',
                description: 'Name of the table to insert into',
              },
              data: {
                type: 'object',
                description: 'Data to insert',
                additionalProperties: true,
              },
            },
            required: ['table', 'data'],
          },
        },
        {
          name: 'update_data',
          description: 'Update data in a Supabase table',
          inputSchema: {
            type: 'object',
            properties: {
              table: {
                type: 'string',
                description: 'Name of the table to update',
              },
              data: {
                type: 'object',
                description: 'Data to update',
                additionalProperties: true,
              },
              filters: {
                type: 'object',
                description: 'Filter conditions to identify rows to update',
                additionalProperties: true,
              },
            },
            required: ['table', 'data', 'filters'],
          },
        },
        {
          name: 'delete_data',
          description: 'Delete data from a Supabase table',
          inputSchema: {
            type: 'object',
            properties: {
              table: {
                type: 'string',
                description: 'Name of the table to delete from',
              },
              filters: {
                type: 'object',
                description: 'Filter conditions to identify rows to delete',
                additionalProperties: true,
              },
            },
            required: ['table', 'filters'],
          },
        },
        {
          name: 'rpc',
          description: 'Call a Postgres function (RPC)',
          inputSchema: {
            type: 'object',
            properties: {
              function: {
                type: 'string',
                description: 'Name of the function to call',
              },
              params: {
                type: 'object',
                description: 'Parameters to pass to the function',
                additionalProperties: true,
              },
            },
            required: ['function'],
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        switch (request.params.name) {
          case 'query_data': {
            const { table, select, filters = {}, limit } = request.params.arguments as {
              table: string;
              select: string;
              filters?: Record<string, any>;
              limit?: number;
            };
            let query = this.supabase.from(table).select(select);

            // Apply filters
            Object.entries(filters).forEach(([key, value]) => {
              query = query.eq(key, value);
            });

            // Apply limit if specified
            if (limit) {
              query = query.limit(limit);
            }

            const { data, error } = await query;

            if (error) throw error;

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(data, null, 2),
                },
              ],
            };
          }

          case 'insert_data': {
            const { table, data } = request.params.arguments as {
              table: string;
              data: Record<string, any>;
            };
            const { data: result, error } = await this.supabase
              .from(table)
              .insert(data)
              .select();

            if (error) throw error;

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case 'update_data': {
            const { table, data, filters } = request.params.arguments as {
              table: string;
              data: Record<string, any>;
              filters: Record<string, any>;
            };
            let query = this.supabase.from(table).update(data);

            // Apply filters
            Object.entries(filters).forEach(([key, value]) => {
              query = query.eq(key, value);
            });

            const { data: result, error } = await query.select();

            if (error) throw error;

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case 'delete_data': {
            const { table, filters } = request.params.arguments as {
              table: string;
              filters: Record<string, any>;
            };
            let query = this.supabase.from(table).delete();

            // Apply filters
            Object.entries(filters).forEach(([key, value]) => {
              query = query.eq(key, value);
            });

            const { data: result, error } = await query.select();

            if (error) throw error;

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case 'rpc': {
            const { function: funcName, params = {} } = request.params.arguments as {
              function: string;
              params?: Record<string, any>;
            };
            const { data, error } = await this.supabase.rpc(funcName, params);

            if (error) throw error;

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(data, null, 2),
                },
              ],
            };
          }

          case 'execute_sql': {
            const { query } = request.params.arguments as {
              query: string;
            };
            const { data, error } = await this.supabase
              .from('_sql')
              .select(`${query}`);

            if (error) throw error;

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(data, null, 2),
                },
              ],
            };
          }

          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${request.params.name}`
            );
        }
      } catch (error: any) {
        console.error(error);
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Supabase MCP server running on stdio');
  }
}

const server = new SupabaseServer();
server.run().catch(console.error);
