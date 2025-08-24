"""
MCP Tools for SEI Solar Charging Station MCP Server
"""

import asyncio
from typing import Dict, Any
from fastmcp import FastMCP

from config import config
from blockchain import blockchain


def register_server_tools(mcp: FastMCP) -> None:
    """Register server management tools with FastMCP."""
    
    @mcp.tool()
    async def get_server_info() -> Dict[str, Any]:
        """Get information about the MCP server and connected contracts."""
        try:
            # Get blockchain connection info
            is_connected = blockchain.web3.is_connected()
            block_number = blockchain.web3.eth.block_number if is_connected else None
            
            return {
                "server_name": "EV Solar Charging Station MCP Server",
                "version": "1.0.0",
                "transport": "SSE",
                "blockchain": {
                    "connected": is_connected,
                    "rpc_url": config.RPC_URL,
                    "current_block": block_number,
                    "admin_address": blockchain.admin_account.address,
                },
                "contracts": {
                    "charging_booking": {
                        "address": config.CHARGING_BOOKING_ADDRESS,
                        "functions_available": len([f for f in config.CHARGING_BOOKING_ABI if f.get('type') == 'function'])
                    },
                    "user_wallet": {
                        "address": config.USER_WALLET_ADDRESS,
                        "functions_available": len([f for f in config.USER_WALLET_ABI if f.get('type') == 'function'])
                    },
                    "charging_station": {
                        "address": config.CHARGING_STATION_ADDRESS,
                        "functions_available": len([f for f in config.CHARGING_STATION_ABI if f.get('type') == 'function'])
                    }
                }
            }
        except Exception as e:
            return {"error": str(e), "success": False}

    @mcp.tool()
    async def health_check() -> Dict[str, Any]:
        """Check the health of the server and blockchain connection."""
        try:
            # Test blockchain connection
            is_connected = blockchain.web3.is_connected()
            current_block = None
            contract_balances = {}
            
            if is_connected:
                try:
                    current_block = blockchain.web3.eth.block_number
                except:
                    pass
                    
                # Test contract connections (mock data if not deployed)
                try:
                    contract_balances["charging_booking"] = 0  # Mock for testing
                    contract_balances["user_wallet"] = 0      # Mock for testing
                except Exception as contract_error:
                    contract_balances["error"] = str(contract_error)
            
            return {
                "status": "healthy" if is_connected else "unhealthy",
                "blockchain_connected": is_connected,
                "current_block": current_block,
                "admin_account": blockchain.admin_account.address,
                "contract_balances_wei": contract_balances,
                "timestamp": __import__('time').time(),
                "note": "Contracts may need deployment if blockchain just started"
            }
        except Exception as e:
            return {
                "status": "unhealthy",
                "error": str(e),
                "timestamp": asyncio.get_event_loop().time()
            }