import { BaseTool } from "../tools/BaseTool.js";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { promises as fs } from "fs";

async function findToolsPath(): Promise<string> {
  const currentFilePath = fileURLToPath(import.meta.url);
  const currentDir = dirname(currentFilePath);

  const possiblePaths = [
    join(currentDir, "..", "tools"),
    join(currentDir, "..", "..", "build", "tools"),
    join(dirname(dirname(currentDir)), "tools"),
    join(dirname(dirname(dirname(currentDir))), "build", "tools"),
    join(process.cwd(), "build", "tools"),
  ];

  for (const path of possiblePaths) {
    try {
      const stats = await fs.stat(path);
      if (stats.isDirectory()) {
        const files = await fs.readdir(path);
        if (
          files.some(
            (file) => file.endsWith(".js") && !file.includes("BaseTool")
          )
        ) {
          return path;
        }
      }
    } catch {
      continue;
    }
  }

  throw new Error("Could not find tools directory");
}

const isToolFile = (file: string): boolean => {
  return (
    file.endsWith(".js") &&
    !file.includes("BaseTool") &&
    !file.includes("index") &&
    !file.endsWith(".test.js") &&
    !file.endsWith(".spec.js") &&
    !file.endsWith(".d.js")
  );
};

export async function loadTools(): Promise<BaseTool[]> {
  try {
    const toolsPath = await findToolsPath();
    const files = await fs.readdir(toolsPath);
    const tools: BaseTool[] = [];

    for (const file of files) {
      if (!isToolFile(file)) {
        continue;
      }

      try {
        const modulePath = `file://${join(toolsPath, file)}`;
        const { default: ToolClass } = await import(modulePath);

        if (!ToolClass) {
          continue;
        }

        const tool = new ToolClass();

        if (
          tool.name &&
          tool.toolDefinition &&
          typeof tool.toolCall === "function"
        ) {
          tools.push(tool);
        }
      } catch (error) {
        console.error(`Error loading tool from ${file}:`, error);
      }
    }

    return tools;
  } catch (error) {
    console.error(`Failed to load tools:`, error);
    return [];
  }
}

export function createToolsMap(tools: BaseTool[]): Map<string, BaseTool> {
  return new Map(tools.map((tool) => [tool.name, tool]));
}
