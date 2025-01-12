"""
Web Browser MCP Server
=====================

This module implements an MCP (Message Control Protocol) server that provides web browsing capabilities.
It allows clients to fetch and parse webpage content using specified CSS selectors.

Key Features:
- Fetches webpage content with configurable timeout and user agent
- Extracts basic page information (title, text, links)
- Supports custom CSS selectors for targeted content extraction
- Handles various error conditions gracefully
"""

import aiohttp
import mcp
import asyncio
from bs4 import BeautifulSoup
from typing import Dict, Any, List
from .config import Settings
import mcp.types as types
from mcp.server import Server, InitializationOptions, NotificationOptions

# Initialize server settings and create server instance
settings = Settings()
server = Server(settings.APP_NAME)


@server.list_tools()
async def list_tools() -> List[types.Tool]:
    """
    List available web browsing tools.

    Returns:
        List[types.Tool]: A list containing the browse_webpage tool definition
    """
    return [
        types.Tool(
            name="browse_webpage",
            description="Extract content from a webpage with optional CSS selectors for specific elements",
            inputSchema={
                "type": "object",
                "properties": {
                    "url": {
                        "type": "string",
                        "description": "The URL of the webpage to browse",
                    },
                    "selectors": {
                        "type": "object",
                        "additionalProperties": {"type": "string"},
                        "description": "Optional CSS selectors to extract specific content",
                    },
                },
                "required": ["url"],
            },
        )
    ]


@server.call_tool()
async def call_tool(name: str, arguments: Dict[str, Any]) -> List[types.TextContent]:
    """
    Handle tool calls for web browsing functionality.

    Args:
        name (str): The name of the tool to call (must be 'browse_webpage')
        arguments (Dict[str, Any]): Tool arguments including 'url' and optional 'selectors'

    Returns:
        List[types.TextContent]: The extracted webpage content or error message

    The function performs the following steps:
    1. Validates the tool name
    2. Fetches the webpage content with configured timeout and user agent
    3. Parses the HTML using BeautifulSoup
    4. Extracts basic page information (title, text, links)
    5. Applies any provided CSS selectors for specific content
    6. Handles various error conditions (timeout, HTTP errors, etc.)
    """
    if name != "browse_webpage":
        return [types.TextContent(type="text", text=f"Error: Unknown tool {name}")]

    url = arguments["url"]
    selectors = arguments.get("selectors", {})

    async with aiohttp.ClientSession() as session:
        try:
            headers = {"User-Agent": settings.USER_AGENT}
            timeout = aiohttp.ClientTimeout(total=settings.REQUEST_TIMEOUT)

            async with session.get(url, headers=headers, timeout=timeout) as response:
                if response.status >= 400:
                    return [
                        types.TextContent(
                            type="text",
                            text=f"Error: HTTP {response.status} - Failed to fetch webpage",
                        )
                    ]

                html = await response.text()
                soup = BeautifulSoup(html, "html.parser")

                # Extract basic page information
                result = {
                    "title": soup.title.string if soup.title else None,
                    "text": soup.get_text(strip=True),
                    "links": [
                        {"text": link.text.strip(), "href": link.get("href")}
                        for link in soup.find_all("a", href=True)
                    ],
                }

                # Extract content using provided selectors
                if selectors:
                    for key, selector in selectors.items():
                        elements = soup.select(selector)
                        result[key] = [elem.get_text(strip=True) for elem in elements]

                return [types.TextContent(type="text", text=str(result))]

        except asyncio.TimeoutError:
            return [
                types.TextContent(
                    type="text", text="Error: Request timed out while fetching webpage"
                )
            ]
        except aiohttp.ClientError as e:
            return [types.TextContent(type="text", text=f"Error: {str(e)}")]
        except Exception as e:
            return [types.TextContent(type="text", text=f"Error: {str(e)}")]


async def main():
    """
    Main entry point for the web browser MCP server.
    Sets up and runs the server using stdin/stdout streams.
    """
    # Run the server using stdin/stdout streams
    async with mcp.server.stdio.stdio_server() as (read_stream, write_stream):
        await server.run(
            read_stream,
            write_stream,
            InitializationOptions(
                server_name=settings.APP_NAME,
                server_version=settings.APP_VERSION,
                capabilities=server.get_capabilities(
                    notification_options=NotificationOptions(),
                    experimental_capabilities={},
                ),
            ),
        )
