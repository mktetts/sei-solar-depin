"""
FastAPI routes for SEI Solar Charging Station MCP Server
"""

import json
import asyncio
from typing import Dict, Any
from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse, HTMLResponse

from config import config
from blockchain import blockchain
from .tool_handlers import call_registered_tool


def setup_routes(app: FastAPI) -> None:
    """Setup all FastAPI routes."""
    
    # SSE endpoint for browser clients
    @app.get("/sse")
    async def sse_endpoint(request: Request):
        """Server-Sent Events endpoint for browser clients."""
        
        async def event_stream():
            try:
                # Send initial connection event
                yield f"data: {json.dumps({'type': 'connection', 'status': 'connected', 'server': 'EV Solar Charging Station MCP'})}\n\n"
                
                # Send server info
                server_info = {
                    "server_name": "EV Solar Charging Station MCP Server",
                    "version": "1.0.0",
                    "transport": "SSE",
                    "blockchain": {
                        "connected": blockchain.web3.is_connected(),
                        "rpc_url": config.RPC_URL,
                        "admin_address": blockchain.admin_account.address,
                    }
                }
                yield f"data: {json.dumps({'type': 'server_info', 'data': server_info})}\n\n"
                
                while True:
                    # Send heartbeat every 30 seconds
                    heartbeat = {
                        'type': 'heartbeat',
                        'timestamp': asyncio.get_event_loop().time(),
                        'blockchain_connected': blockchain.web3.is_connected()
                    }
                    yield f"data: {json.dumps(heartbeat)}\n\n"
                    await asyncio.sleep(30)
                    
            except asyncio.CancelledError:
                print("SSE connection closed")
            except Exception as e:
                error_msg = {'type': 'error', 'message': str(e)}
                yield f"data: {json.dumps(error_msg)}\n\n"
        
        return StreamingResponse(
            event_stream(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "*",
            }
        )

    # HTTP endpoints for tool calls from browser
    @app.post("/api/tools/{tool_name}")
    async def call_tool_api(tool_name: str, request: Request):
        """HTTP API endpoint for calling MCP tools from browser."""
        try:
            # Get request body
            body = {}
            if request.headers.get("content-type") == "application/json":
                body = await request.json()

            # Call the registered MCP tools directly
            result = await call_registered_tool(tool_name, **body)

            return {
                "success": True,
                "tool": tool_name,
                "result": result,
                "timestamp": __import__('time').time()
            }

        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "tool": tool_name,
                "timestamp": asyncio.get_event_loop().time()
            }

    # Serve the HTML client
    @app.get("/", response_class=HTMLResponse)
    async def serve_client():
        """Serve the HTML client."""
        try:
            with open("index.html", "r") as f:
                return f.read()
        except FileNotFoundError:
            return "<h1>HTML client not found</h1><p>Make sure index.html is in the server directory.</p>"

    # List available tools
    @app.get("/api/tools")
    async def list_tools():
        """Get list of available tools."""
        tools = [
            {"name": "health_check", "description": "Check server and blockchain health"},
            {"name": "get_server_info", "description": "Get server information"},
            {"name": "get_all_charging_points", "description": "List all charging stations"},
            {"name": "calculate_charging_price", "description": "Calculate charging price"},
            {"name": "get_user_balance", "description": "Get user wallet balance"},
            {"name": "get_gas_estimates", "description": "Get gas price estimates"},
            {"name": "get_user_bookings", "description": "Get user's booking history"},
            {"name": "get_booking_details", "description": "Get specific booking details"},
            {"name": "get_booking_count", "description": "Get total number of bookings"},
            {"name": "get_contract_balance", "description": "Get charging booking contract balance"},
            {"name": "prebook_charging_session", "description": "Create a prebooking (no payment required)"},
            {"name": "buy_power_from_station", "description": "Purchase power and create booking with device HTTP integration"},
            {"name": "stop_charging", "description": "🛑 Smart stop: Automatically finds and stops your most recent charging session (no parameters required)"},
            {"name": "get_station_battery_capacity", "description": "🔋 Get real-time battery capacity and status from charging station"},
            {"name": "find_nearest_charging_station", "description": "📍 Find closest charging stations using Haversine distance algorithm"},
            {"name": "estimate_charging_time", "description": "⏱️ Estimate charging time by calling station's /estimate endpoint with energy and power rate"},
        ]
        return {"success": True, "tools": tools}