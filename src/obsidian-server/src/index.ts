#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import matter from 'gray-matter';
import MarkdownIt from 'markdown-it';

const VAULT_PATH = process.env.OBSIDIAN_VAULT_PATH;
if (!VAULT_PATH) {
  throw new Error('OBSIDIAN_VAULT_PATH environment variable is required');
}
const VAULT_PATH_STRING: string = VAULT_PATH;

const md = new MarkdownIt();

interface Note {
  title: string;
  content: string;
  path: string;
  frontmatter?: Record<string, any>;
}

class ObsidianServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: 'obsidian-server',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();

    this.server.onerror = (error) => console.error('[MCP Error]', error);
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private async readNote(notePath: string): Promise<Note> {
    const fullPath = path.join(VAULT_PATH_STRING, notePath);
    const content = await fs.readFile(fullPath, 'utf-8');
    const { data: frontmatter, content: markdownContent } = matter(content);
    return {
      title: path.basename(notePath, '.md'),
      content: markdownContent,
      path: notePath,
      frontmatter,
    };
  }

  private async writeNote(notePath: string, content: string, frontmatter?: Record<string, any>): Promise<void> {
    const fullPath = path.join(VAULT_PATH_STRING, notePath);
    let fileContent = content;
    if (frontmatter) {
      fileContent = matter.stringify(content, frontmatter);
    }
    await fs.writeFile(fullPath, fileContent);
  }

  private async searchNotes(query: string): Promise<Note[]> {
    const notes: Note[] = [];
    const searchRecursive = async (dir: string) => {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await searchRecursive(fullPath);
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          const relativePath = path.relative(VAULT_PATH_STRING, fullPath);
          const note = await this.readNote(relativePath);
          if (
            note.content.toLowerCase().includes(query.toLowerCase()) ||
            note.title.toLowerCase().includes(query.toLowerCase())
          ) {
            notes.push(note);
          }
        }
      }
    };
    await searchRecursive(VAULT_PATH_STRING);
    return notes;
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'read_note',
          description: 'Read a note from the Obsidian vault',
          inputSchema: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: 'Path to the note relative to vault root',
              },
            },
            required: ['path'],
          },
        },
        {
          name: 'write_note',
          description: 'Write a note to the Obsidian vault',
          inputSchema: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: 'Path to the note relative to vault root',
              },
              content: {
                type: 'string',
                description: 'Note content in markdown format',
              },
              frontmatter: {
                type: 'object',
                description: 'Optional YAML frontmatter',
              },
            },
            required: ['path', 'content'],
          },
        },
        {
          name: 'search_notes',
          description: 'Search notes in the Obsidian vault',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Search query',
              },
            },
            required: ['query'],
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        switch (request.params.name) {
          case 'read_note': {
            const { path: notePath } = request.params.arguments as { path: string };
            const note = await this.readNote(notePath);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(note, null, 2),
                },
              ],
            };
          }

          case 'write_note': {
            const { path: notePath, content, frontmatter } = request.params.arguments as {
              path: string;
              content: string;
              frontmatter?: Record<string, any>;
            };
            await this.writeNote(notePath, content, frontmatter);
            return {
              content: [
                {
                  type: 'text',
                  text: `Note written successfully to ${notePath}`,
                },
              ],
            };
          }

          case 'search_notes': {
            const { query } = request.params.arguments as { query: string };
            const notes = await this.searchNotes(query);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(notes, null, 2),
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
        if (error instanceof McpError) {
          throw error;
        }
        throw new McpError(
          ErrorCode.InternalError,
          error instanceof Error ? error.message : String(error)
        );
      }
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Obsidian MCP server running on stdio');
  }
}

const server = new ObsidianServer();
server.run().catch(console.error);
