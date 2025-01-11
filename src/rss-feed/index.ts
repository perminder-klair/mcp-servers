#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import Parser, { Item } from 'rss-parser';

// Ensure arguments match the input schema
interface FetchFeedArgs {
  url: string;
  limit?: number;
}

interface GetFeedItemsArgs {
  url: string;
  limit?: number;
  filter?: {
    after?: string; // Date string
    before?: string; // Date string
    search?: string; // Search term
  };
}

class RssFeedServer {
  private server: Server;
  private parser: Parser;

  constructor() {
    this.server = new Server(
      {
        name: 'rss-feed',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.parser = new Parser();

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
          name: 'fetch_feed',
          description: 'Fetch and parse an RSS feed, returning metadata and recent items',
          inputSchema: {
            type: 'object',
            properties: {
              url: {
                type: 'string',
                description: 'URL of the RSS feed',
              },
              limit: {
                type: 'number',
                description: 'Maximum number of items to return (default: 10)',
                minimum: 1,
              },
            },
            required: ['url'],
          },
        },
        {
          name: 'get_feed_items',
          description: 'Get items from an RSS feed with optional filtering',
          inputSchema: {
            type: 'object',
            properties: {
              url: {
                type: 'string',
                description: 'URL of the RSS feed',
              },
              limit: {
                type: 'number',
                description: 'Maximum number of items to return (default: 10)',
                minimum: 1,
              },
              filter: {
                type: 'object',
                properties: {
                  after: {
                    type: 'string',
                    description: 'Only return items after this date (ISO 8601)',
                  },
                  before: {
                    type: 'string',
                    description: 'Only return items before this date (ISO 8601)',
                  },
                  search: {
                    type: 'string',
                    description: 'Search term to filter items by title/content',
                  },
                },
              },
            },
            required: ['url'],
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      switch (request.params.name) {
        case 'fetch_feed': {
          const args = request.params.arguments as Record<string, unknown>;
          if (typeof args?.url !== 'string') {
            throw new McpError(ErrorCode.InvalidParams, 'URL is required and must be a string');
          }
          return this.handleFetchFeed({
            url: args.url,
            limit: typeof args?.limit === 'number' ? args.limit : undefined
          });
        }
        case 'get_feed_items': {
          const args = request.params.arguments as Record<string, unknown>;
          if (typeof args?.url !== 'string') {
            throw new McpError(ErrorCode.InvalidParams, 'URL is required and must be a string');
          }
          return this.handleGetFeedItems({
            url: args.url,
            limit: typeof args?.limit === 'number' ? args.limit : undefined,
            filter: typeof args?.filter === 'object' ? args.filter as GetFeedItemsArgs['filter'] : undefined
          });
        }
        default:
          throw new McpError(
            ErrorCode.MethodNotFound,
            `Unknown tool: ${request.params.name}`
          );
      }
    });
  }

  private async handleFetchFeed(args: FetchFeedArgs) {
    try {
      const feed = await this.parser.parseURL(args.url);
      const limit = args.limit || 10;

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                title: feed.title,
                description: feed.description,
                link: feed.link,
                lastBuildDate: feed.lastBuildDate,
                items: feed.items.slice(0, limit).map((item: Item) => ({
                  title: item.title,
                  link: item.link,
                  pubDate: item.pubDate,
                  content: item.content,
                  contentSnippet: item.contentSnippet,
                })),
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Failed to fetch feed: ${(error as Error).message}`,
          },
        ],
        isError: true,
      };
    }
  }

  private async handleGetFeedItems(args: GetFeedItemsArgs) {
    try {
      const feed = await this.parser.parseURL(args.url);
      let items = feed.items;

      // Apply filters if provided
      if (args.filter) {
        if (args.filter.after) {
          const after = new Date(args.filter.after);
          items = items.filter(
            (item: Item) => new Date(item.pubDate || '') > after
          );
        }

        if (args.filter.before) {
          const before = new Date(args.filter.before);
          items = items.filter(
            (item: Item) => new Date(item.pubDate || '') < before
          );
        }

        if (args.filter.search) {
          const search = args.filter.search.toLowerCase();
          items = items.filter(
            (item: Item) =>
              (item.title?.toLowerCase().includes(search) ||
                item.content?.toLowerCase().includes(search) ||
                item.contentSnippet?.toLowerCase().includes(search)) ?? false
          );
        }
      }

      // Apply limit
      const limit = args.limit || 10;
      items = items.slice(0, limit);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              items.map((item: Item) => ({
                title: item.title,
                link: item.link,
                pubDate: item.pubDate,
                content: item.content,
                contentSnippet: item.contentSnippet,
              })),
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Failed to fetch feed items: ${(error as Error).message}`,
          },
        ],
        isError: true,
      };
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('RSS Feed MCP server running on stdio');
  }
}

const server = new RssFeedServer();
server.run().catch(console.error);
