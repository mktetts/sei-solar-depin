# SEI Solar Charging Station MCP Server

A comprehensive Model Context Protocol (MCP) server for managing EV solar charging station bookings and user wallets using smart contracts on the SEI blockchain. Features real-time device communication, AI-powered assistance, and decentralized energy trading capabilities.

## 🏗️ System Architecture

The MCP server bridges AI assistants with blockchain infrastructure through three core smart contracts:

1. **ChargingStation** - Registry of charging stations with GPS coordinates and device URLs
2. **ChargingBooking** - Power purchases, booking management, and emergency stops with refund logic  
3. **UserWallet** - User balance management and gas-optimized transaction execution

## ✨ Key Features

### 🔋 Real-time Device Integration
- **HTTP Communication**: Direct communication with ESP32 charging stations
- **Battery Monitoring**: Real-time capacity and voltage readings via `/battery` endpoint
- **Power Control**: Automatic device activation/deactivation during transactions
- **Consumption Tracking**: Precise energy delivery measurement with automatic refund calculation

### 🌍 Location Services
- **GPS-based Station Discovery**: Find nearest charging stations using Haversine algorithm
- **Geographic Filtering**: Filter stations by distance and availability
- **Location-aware Pricing**: Calculate costs based on proximity and demand

### 💰 Decimal Value Support
- **High Precision**: Full support for small decimal values (e.g., 0.005 watts, 0.001 power)
- **Fixed-point Arithmetic**: 3-decimal precision using SCALE_FACTOR = 1000
- **AI Integration**: Natural language processing for any decimal input values

### 🛡️ Safety & Diagnostics
- **Emergency Stop**: Smart stop that automatically finds and stops active charging sessions
- **Diagnostic Tools**: Comprehensive balance, earnings, and transaction flow debugging
- **Timeout Handling**: Graceful fallback when device communication fails
- **Refund Protection**: Automatic refund calculation based on actual power consumption

## 🔧 Available Tools

### ChargingBooking Contract Operations

| Tool | Description | Parameters |
|------|-------------|------------|
| `get_all_charging_points` | List all stations with GPS coordinates | None |
| `calculate_charging_price` | Calculate cost for power purchase | `station_id`, `watt`, `power` |
| `buy_power_from_station` | Purchase power + activate device | `user_address`, `station_id`, `watt`, `power` |
| `stop_charging` | Smart emergency stop (auto-finds active booking) | `user_address` |
| `get_booking_details` | Get specific booking information | `booking_id` |
| `get_user_bookings` | Get all bookings for a user | `user_address` |
| `complete_charging_workflow` | Full end-to-end charging cycle | `user_address`, `station_id`, `watt`, `power`, `duration` |

### UserWallet Contract Operations

| Tool | Description | Parameters |
|------|-------------|------------|
| `get_user_balance` | Check user's wallet balance | `user_address` |
| `execute_transaction_for_user` | Execute transactions via UserWallet proxy | `user_address`, `target`, `amount`, `data` |
| `get_gas_estimates` | Current gas prices and operation costs | None |
| `debug_balance_and_earnings` | Comprehensive diagnostic tool | None |

### Device Communication Tools

| Tool | Description | Parameters |
|------|-------------|------------|
| `get_station_battery_capacity` | Real-time battery status via HTTP | `station_id` |
| `estimate_charging_time` | Time estimation via device endpoint | `station_id`, `energy_wh`, `power_rate` |
| `find_nearest_charging_station` | GPS-based station discovery | `user_latitude`, `user_longitude`, `max_results` |

### System Management Tools

| Tool | Description | Parameters |
|------|-------------|------------|
| `health_check` | Server and blockchain connectivity | None |
| `get_server_info` | Server version and contract addresses | None |
| `get_booking_count` | Total system booking count | None |
| `get_contract_balance` | ChargingBooking contract balance | None |

## 📋 Prerequisites

- **Python 3.12+** with UV package manager
- **Node.js 18+** for smart contract deployment
- **SEI Blockchain RPC** access (testnet or local Hardhat node)
- **ESP32 Devices** for physical charging stations (optional)

## 🛠️ Installation & Setup

### 1. Environment Setup
```bash
# Navigate to MCP server directory
cd mcp-server

# Install dependencies using UV
uv sync

# Create environment file
cp .env.example .env
```

### 2. Configure Environment Variables

Edit `.env` file with your configuration:

```env
# Blockchain Configuration
SEI_RPC_URL=rpc url
ADMIN_PRIVATE_KEY=private key

# AI Configuration (Optional - for Groq client testing)
GROQ_API_KEY=your_groq_api_key_here
```

### 3. Deploy Smart Contracts

```bash
# Navigate to smart contracts folder
cd ../smartcontract

# Install dependencies
npm install


# Deploy to SEI testnet
npm run deploy:testnet
```

### 4. Start the MCP Server

```bash
# Return to MCP server directory
cd ../mcp-server

# Start with UV
uv run python main.py

# Or activate virtual environment first
source .venv/bin/activate
python main.py
```

## 🚀 Server Endpoints

### MCP Server Access Points

| Endpoint | Purpose | Usage |
|----------|---------|--------|
| `http://localhost:8080` | HTML Chat Client | Browser-based AI assistant |
| `http://localhost:8080/sse` | Server-Sent Events | Real-time data stream |
| `http://localhost:8080/api/tools/{tool_name}` | HTTP API | Direct tool calls |
| `stdio://` | MCP Protocol | Direct MCP client integration |

### Tool API Usage Examples

**Health Check:**
```bash
curl -X POST http://localhost:8080/api/tools/health_check
```

**Get Charging Stations:**
```bash
curl -X POST http://localhost:8080/api/tools/get_all_charging_points
```

**Calculate Price (with decimals):**
```bash
curl -X POST http://localhost:8080/api/tools/calculate_charging_price \
  -H "Content-Type: application/json" \
  -d '{"station_id": 1, "watt": 0.005, "power": 0.25}'
```

**Buy Power (full decimal support):**
```bash
curl -X POST http://localhost:8080/api/tools/buy_power_from_station \
  -H "Content-Type: application/json" \
  -d '{
    "user_address": "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    "station_id": 1,
    "watt": 0.1,
    "power": 0.5
  }'
```

**Smart Emergency Stop:**
```bash
curl -X POST http://localhost:8080/api/tools/stop_charging \
  -H "Content-Type: application/json" \
  -d '{"user_address": "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"}'
```

## 🧪 Testing & Development

### Interactive AI Testing

Use the built-in Groq client for comprehensive testing:

```bash
# Run test suite
uv run python groq_client.py

# Interactive mode
uv run python groq_client.py interactive
```

**Available interactive commands:**
- `stations` - List all charging stations
- `health` - Check system health
- `price <station_id> <watt> <power>` - Calculate pricing
- `balance <address>` - Check user balance
- `bookings <address>` - Get user bookings

### Manual API Testing

Test decimal support with curl:

```bash
# Test small decimal values
curl -X POST http://localhost:8080/api/tools/calculate_charging_price \
  -H "Content-Type: application/json" \
  -d '{"station_id": 1, "watt": 0.001, "power": 0.005}'

# Test battery monitoring
curl -X POST http://localhost:8080/api/tools/get_station_battery_capacity \
  -H "Content-Type: application/json" \
  -d '{"station_id": 1}'

# Test location services
curl -X POST http://localhost:8080/api/tools/find_nearest_charging_station \
  -H "Content-Type: application/json" \
  -d '{"user_latitude": 40.7128, "user_longitude": -74.0060, "max_results": 3}'
```

## 📁 Project Structure

```
mcp-server/
├── main.py                          # Main server entry point
├── config.py                        # Configuration management
├── blockchain.py                     # Blockchain service layer
├── .env.example                      # Environment template
├── pyproject.toml                    # Dependencies and project config
├── index.html                        # Browser-based chat client
├── tools/                           # MCP tool implementations
│   ├── charging_booking_tools.py    # ChargingBooking contract tools
│   └── user_wallet_tools.py         # UserWallet contract tools
├── api/                             # HTTP API layer
│   ├── routes.py                     # FastAPI route definitions
│   └── tool_handlers.py             # Tool execution handlers
├── server/                          # MCP server components
│   └── mcp_tools.py                  # Server management tools
└── contracts/                       # Contract ABIs and addresses
    ├── ChargingBooking_address.json  # Contract deployment addresses
    ├── ChargingBooking_contract.json # Contract ABI definitions
    ├── UserWallet_address.json
    ├── UserWallet_contract.json
    ├── ChargingStation_address.json
    └── ChargingStation_contract.json
```

## 🔗 Smart Contract Integration

### Contract Interaction Patterns

1. **UserWallet Proxy Pattern**: All ChargingBooking transactions executed through UserWallet for gas management
2. **Event-driven Updates**: Real-time event decoding for booking status changes
3. **Fixed-point Arithmetic**: Decimal values scaled by 1000 for contract storage
4. **Emergency Stop Logic**: Automatic refund calculation based on actual power consumption

### Decimal Value Handling

```python
# Internal scaling for 3 decimal precision
SCALE_FACTOR = 1000

# Convert user input to contract values
def scale_to_contract(decimal_value: float) -> int:
    return int(decimal_value * SCALE_FACTOR)

# Convert contract values to user display
def scale_from_contract(scaled_value: int) -> float:
    return scaled_value / SCALE_FACTOR

# Examples:
# 0.005 watts → 5 (stored in contract)
# 5 (from contract) → 0.005 watts (displayed to user)
```

### Device Communication Flow

```
1. User calls buy_power_from_station with decimal values
2. MCP server scales values for contract storage
3. Smart contract transaction executed via UserWallet
4. BookingCreated event decoded to get booking ID
5. Station URL retrieved from ChargingStation contract
6. HTTP GET request sent to device: /toggle/{watt}/{power}
7. Device responds with charging status
8. User can later call stop_charging
9. HTTP GET request sent to device: /stop
10. Device returns actual delivered_Wh
11. Emergency stop transaction updates blockchain with refund
```

## 🔍 Diagnostics & Monitoring

### Health Monitoring

The server provides comprehensive health monitoring:

```bash
# Check overall system health
curl -X POST http://localhost:8080/api/tools/health_check

# Get detailed balance and earnings diagnostic
curl -X POST http://localhost:8080/api/tools/debug_balance_and_earnings
```

### Error Handling

- **Connection Failures**: Graceful fallback when blockchain/device unavailable
- **Transaction Failures**: Detailed error messages with transaction hashes
- **Device Timeouts**: 10-second timeout with fallback values for emergency stops
- **Invalid Parameters**: Comprehensive parameter validation with helpful examples

## 🛡️ Security Considerations

- **Private Key Management**: Store private keys securely (hardware wallets in production)
- **Admin Privileges**: Admin account has elevated privileges for contract management
- **User Balance Protection**: All balance changes logged on-chain for transparency
- **Gas Limit Safety**: Increased gas limits (250k) to prevent out-of-gas failures
- **Input Validation**: Comprehensive parameter validation for all tool inputs

## 🚀 Production Deployment

### Environment Configuration

```env
# Production settings
SEI_RPC_URL=https://sei-testnet-rpc.sei.io
ADMIN_PRIVATE_KEY=<secure_private_key>
```

### Performance Optimizations

- **Connection Pooling**: HTTP client connection reuse for device communication
- **Caching**: Contract address and ABI caching for faster responses  
- **Gas Optimization**: Smart gas estimation based on operation type
- **Batch Operations**: Multiple tool calls can be batched for efficiency

### Monitoring & Logging

- Set `DEBUG=1` environment variable for verbose logging
- Monitor blockchain connectivity with health check endpoint
- Track device communication success rates
- Monitor user balance changes and transaction patterns

## 🤝 Integration with AI Assistants

The MCP server is designed for seamless integration with AI assistants:

### Natural Language Support

- **Decimal Values**: "Charge 0.005 watts at 0.25 power rate"
- **Location Queries**: "Find nearest charging stations to my location"  
- **Smart Commands**: "Stop my charging session" (automatically finds active booking)

