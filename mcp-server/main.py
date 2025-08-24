#!/usr/bin/env python3
"""
EV Solar Charging Station MCP Server
Uses SSE transport for Model Context Protocol communication with CORS support
"""

import os
import sys
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from fastmcp import FastMCP
import uvicorn

# Load environment variables
load_dotenv()

# Import our modular components
try:
    from config import config
    from blockchain import blockchain
    from tools.charging_booking_tools import register_charging_booking_tools
    from tools.user_wallet_tools import register_user_wallet_tools
    from server.mcp_tools import register_server_tools
    from api.routes import setup_routes
except ImportError as e:
    print(f"Import error: {e}")
    print("Make sure all dependencies are installed and files are in the correct location")
    sys.exit(1)

# Initialize FastMCP for SSE transport
mcp = FastMCP("EV Solar Charging Station MCP Server")

# Create FastAPI app for browser compatibility
app = FastAPI(title="EV Solar Charging Station MCP Server")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for development
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def setup_mcp_tools():
    """Register all MCP tools."""
    print("Registering MCP tools...")
    
    # Register server management tools
    register_server_tools(mcp)
    print("✅ Server tools registered")
    
    # Register charging booking tools
    register_charging_booking_tools(mcp)
    print("✅ ChargingBooking tools registered")
    
    # Register user wallet tools
    register_user_wallet_tools(mcp)
    print("✅ UserWallet tools registered")


def validate_environment():
    """Validate environment and configuration."""
    print("=" * 70)
    print("🔋 EV Solar Charging Station MCP Server (SSE + Browser Support)")
    print("=" * 70)
    
    # Validate environment and configuration
    print(f"RPC URL: {config.RPC_URL}")
    print(f"Admin Address: {blockchain.admin_account.address}")
    print(f"ChargingBooking: {config.CHARGING_BOOKING_ADDRESS}")
    print(f"UserWallet: {config.USER_WALLET_ADDRESS}")
    print(f"ChargingStation: {config.CHARGING_STATION_ADDRESS}")
    
    # Test blockchain connection
    if blockchain.web3.is_connected():
        print(f"✅ Connected to blockchain (Block: {blockchain.web3.eth.block_number})")
    else:
        print("⚠️  Could not connect to blockchain - server will still start")


def main():
    """Initialize and run the MCP server with browser support."""
    try:
        # Validate environment
        validate_environment()
        
        # Setup MCP tools
        setup_mcp_tools()
        
        # Setup FastAPI routes
        setup_routes(app)
        print("✅ API routes configured")
        
        # Start server
        print(f"\n🚀 Starting servers...")
        print("🔗 HTML Client: http://127.0.0.1:8080")
        print("🔗 SSE Endpoint: http://127.0.0.1:8080/sse")
        print("🔗 API Endpoint: http://127.0.0.1:8080/api/tools/{tool_name}")
        print("🔗 MCP Server: Available via FastMCP transport")
        
        print("\n📋 Available features:")
        print("   • Browser-based chat client with OpenAI GPT-4")
        print("   • Real-time blockchain data via SSE")
        print("   • Smart contract interaction tools")
        print("   • CORS-enabled for browser access")
        print("   • SEI blockchain focused responses")
        print("\nPress Ctrl+C to stop the server\n")
        
        # Run FastAPI server with uvicorn
        uvicorn.run(
            app,
            host="0.0.0.0",
            port=8080,
            log_level="info"
        )
        
    except KeyboardInterrupt:
        print("\n👋 Server stopped by user")
    except Exception as e:
        print(f"❌ Server error: {e}")
        raise


if __name__ == "__main__":
    main()
