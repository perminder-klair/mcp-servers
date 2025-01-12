#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import TelegramBot from 'node-telegram-bot-api';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!BOT_TOKEN) {
  throw new Error('TELEGRAM_BOT_TOKEN environment variable is required');
}

class TelegramServer {
  private server: Server;
  private bot: TelegramBot;

  constructor() {
    this.server = new Server(
      {
        name: 'telegram-server',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Initialize bot with polling disabled (we'll use webhook or custom methods)
    this.bot = new TelegramBot(BOT_TOKEN, { polling: false });

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
          name: 'send_message',
          description: 'Send a message to a Telegram chat',
          inputSchema: {
            type: 'object',
            properties: {
              chat_id: {
                type: 'string',
                description: 'Chat ID or @username of the target chat',
              },
              text: {
                type: 'string',
                description: 'Text message to send',
              },
              parse_mode: {
                type: 'string',
                enum: ['Markdown', 'HTML'],
                description: 'Parse mode for message formatting',
              },
            },
            required: ['chat_id', 'text'],
          },
        },
        {
          name: 'get_chat',
          description: 'Get information about a chat',
          inputSchema: {
            type: 'object',
            properties: {
              chat_id: {
                type: 'string',
                description: 'Chat ID or @username of the target chat',
              },
            },
            required: ['chat_id'],
          },
        },
        {
          name: 'send_photo',
          description: 'Send a photo to a Telegram chat',
          inputSchema: {
            type: 'object',
            properties: {
              chat_id: {
                type: 'string',
                description: 'Chat ID or @username of the target chat',
              },
              photo: {
                type: 'string',
                description: 'URL or file path of the photo',
              },
              caption: {
                type: 'string',
                description: 'Optional caption for the photo',
              },
            },
            required: ['chat_id', 'photo'],
          },
        },
        {
          name: 'get_updates',
          description: 'Get latest updates/messages from the bot',
          inputSchema: {
            type: 'object',
            properties: {
              limit: {
                type: 'number',
                description: 'Limit the number of updates to retrieve (default: 10)',
              },
              timeout: {
                type: 'number',
                description: 'Timeout in seconds for long polling (default: 0)',
              },
            },
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        switch (request.params.name) {
          case 'send_message': {
            const { chat_id, text, parse_mode } = request.params.arguments;
            const result = await this.bot.sendMessage(chat_id, text, {
              parse_mode,
            });
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case 'get_chat': {
            const { chat_id } = request.params.arguments;
            const result = await this.bot.getChat(chat_id);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case 'send_photo': {
            const { chat_id, photo, caption } = request.params.arguments;
            const result = await this.bot.sendPhoto(chat_id, photo, {
              caption,
            });
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case 'get_updates': {
            const { limit = 10, timeout = 0 } = request.params.arguments;
            const result = await this.bot.getUpdates({
              limit,
              timeout,
            });
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
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
      } catch (error) {
        console.error('Telegram API Error:', error);
        throw new McpError(
          ErrorCode.InternalError,
          `Telegram API error: ${error.message}`
        );
      }
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Telegram MCP server running on stdio');
  }
}

const server = new TelegramServer();
server.run().catch(console.error);
