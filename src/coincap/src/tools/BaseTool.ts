import {
  CallToolRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

export interface BaseTool {
  name: string;
  toolDefinition: Tool;
  toolCall(request: z.infer<typeof CallToolRequestSchema>): Promise<any>;
}

export abstract class BaseToolImplementation implements BaseTool {
  abstract name: string;
  abstract toolDefinition: Tool;
  abstract toolCall(
    request: z.infer<typeof CallToolRequestSchema>
  ): Promise<any>;
}
