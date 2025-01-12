import pytest
from web_browser_mcp_server.server import list_tools, call_tool
from aioresponses import aioresponses


@pytest.mark.asyncio
async def test_list_tools():
    tools = await list_tools()
    assert len(tools) == 1
    assert tools[0].name == "browse_webpage"
    assert "url" in tools[0].inputSchema["properties"]


@pytest.mark.asyncio
async def test_call_tool_invalid():
    result = await call_tool("invalid_tool", {})
    assert len(result) == 1
    assert "Error: Unknown tool" in result[0].text


@pytest.mark.asyncio
async def test_browse_webpage():
    mock_html = """
    <html>
        <head><title>Test Page</title></head>
        <body>
            <a href="https://test.com">Test Link</a>
            <div class="content">Test Content</div>
        </body>
    </html>
    """

    with aioresponses() as m:
        m.get("https://test.com", status=200, body=mock_html)

        result = await call_tool(
            "browse_webpage",
            {"url": "https://test.com", "selectors": {"content": ".content"}},
        )

        assert len(result) == 1
        content = result[0].text
        assert "Test Page" in content
        assert "Test Link" in content
        assert "Test Content" in content
