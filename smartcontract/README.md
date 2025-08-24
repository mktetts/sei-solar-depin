# SEI Solar Charging Station Smart Contracts

Solidity smart contracts for the decentralized EV solar charging network on SEI blockchain. Implements comprehensive booking system, user wallet management, and real-time device integration with fixed-point decimal arithmetic support.

## 🏗️ Contract Architecture

### Core Contracts

| Contract | Purpose | Key Features |
|----------|---------|--------------|
| **UserWallet.sol** | User balance & transaction management | Gas-optimized proxy execution, refund handling |
| **ChargingStation.sol** | Station registry & device URLs | GPS coordinates, pricing, device HTTP endpoints |
| **ChargingBooking.sol** | Booking & payment processing | Decimal support, emergency stops, automatic refunds |

### Contract Dependencies

```
UserWallet (deployed first)
    ↓
ChargingStation (depends on UserWallet)
    ↓ 
ChargingBooking (depends on both UserWallet & ChargingStation)
```

## ✨ Key Features

### 💰 Decimal Value Support
- **Fixed-point Arithmetic**: 3 decimal precision using `SCALE_FACTOR = 1000`
- **Natural Input**: Accept 0.005 watts, automatically scaled to 5 in contract
- **Precise Calculations**: Accurate pricing for small energy amounts

### 🛡️ Safety Mechanisms
- **Emergency Stop**: Stop charging with automatic refund calculation
- **Refund Protection**: Unused power automatically refunded to user balance
- **Gas Management**: Optimized gas usage with 250k gas limit for complex calls
- **Balance Verification**: Comprehensive balance checking before transactions

### 🔗 Device Integration
- **HTTP Endpoints**: Direct device communication via stored URLs
- **Event-driven Control**: Smart contract events trigger device actions
- **Real-time Monitoring**: Track actual power consumption vs booked amounts

## 📋 Prerequisites

- **Node.js 18+** with npm
- **Hardhat development environment**
- **SEI testnet access** (or local Hardhat node)
- **Private key** with sufficient SEI tokens for deployment

## 🛠️ Installation & Setup

### 1. Install Dependencies

```bash
cd smartcontract
npm install
```

### 2. Environment Configuration

Create `.env` file in the smartcontract directory:

```env
# SEI Testnet Configuration
SEI_TESTNET_RPC_URL=https://evm-rpc-testnet.sei-apis.com
SEI_TESTNET_PRIVATE_KEY=your_private_key_here

# Local Development (Optional)
SEI_RPC_URL=http://127.0.0.1:8545
ADMIN_PRIVATE_KEY=private key
```

### 3. Compile Contracts

```bash
# Compile all contracts
npm run compile

# Clean previous builds
npm run clean
```

## 🚀 Deployment

### Local Development (Hardhat Node)

```bash
# Terminal 1: Start local blockchain
npx hardhat node

# Terminal 2: Deploy contracts
npm run deploy:local
```

### SEI Testnet Deployment

```bash
# Deploy to SEI testnet
npm run deploy:testnet
```

### Custom Network Deployment

```bash
# Deploy to localhost (custom RPC)
npm run deploy:dev
```

## 🧪 Testing

### Run Test Suite

```bash
# Run all tests
npm test

# Run specific test file
npx hardhat test test/charging.test.js
npx hardhat test test/device-control.test.js
npx hardhat test test/emergency-stop.test.js
```

### Test Categories

1. **Basic Functionality** ([`charging.test.js`](test/charging.test.js))
   - Contract deployment
   - User deposits and balance management
   - Station registration and pricing

2. **Device Integration** ([`device-control.test.js`](test/device-control.test.js))
   - HTTP endpoint communication
   - Device state synchronization
   - Power delivery tracking

3. **Emergency Scenarios** ([`emergency-stop.test.js`](test/emergency-stop.test.js))
   - Emergency stop functionality
   - Refund calculations
   - Balance protection mechanisms

## 📊 Contract Details

### UserWallet Contract

**Core Functions:**
```solidity
function deposit() external payable
function withdraw(uint256 amount) external
function executeTransaction(address user, address target, uint256 amount, bytes calldata data) external
function creditUserRefund(address user) external payable
```

**Key Features:**
- **Gas Management**: 250k gas limit with realistic cost estimation
- **Balance Protection**: Ensures user has sufficient balance for transaction + gas
- **Admin Proxy**: Only admin can execute transactions on behalf of users
- **Refund Handling**: Proper crediting of refunds back to user balances

### ChargingBooking Contract

**Core Functions:**
```solidity
function calculatePrice(uint256 stationId, uint256 watt, uint256 power) public view returns (uint256)
function buyPower(address user, uint256 stationId, uint256 watt, uint256 power) external payable
function emergencyStop(address user, uint256 bookingId, uint256 wattsConsumed) external
```

**Decimal Value Handling:**
```solidity
uint256 public constant SCALE_FACTOR = 1000;

// Price calculation with decimal support
// (watt * power * pricePerWatt) / (SCALE_FACTOR * SCALE_FACTOR)
function calculatePrice(uint256 stationId, uint256 watt, uint256 power) public view returns (uint256) {
    uint256 pricePerWatt = chargingStation.getStationPrice(stationId);
    return (watt * power * pricePerWatt) / (SCALE_FACTOR * SCALE_FACTOR);
}
```

**Emergency Stop Logic:**
```solidity
// Calculate refund for unused watts
uint256 unusedWatts = booking.watt - wattsConsumed;
uint256 refundAmount = (unusedWatts * booking.power * pricePerWatt) / (SCALE_FACTOR * SCALE_FACTOR);
```

## 🔧 Contract Interaction Examples

### Deploy and Setup

```javascript
// Deploy contracts
const UserWallet = await ethers.getContractFactory("UserWallet");
const userWallet = await UserWallet.deploy();

const ChargingStation = await ethers.getContractFactory("ChargingStation");
const chargingStation = await ChargingStation.deploy(userWallet.address);

const ChargingBooking = await ethers.getContractFactory("ChargingBooking");
const chargingBooking = await ChargingBooking.deploy(
    chargingStation.address,
    userWallet.address
);
```

### User Deposit and Balance Management

```javascript
// User deposits SEI tokens
await userWallet.connect(user).deposit({ value: ethers.parseEther("1.0") });

// Check balance
const balance = await userWallet.getUserBalance(user.address);
console.log("User balance:", ethers.formatEther(balance));
```

### Register Charging Station

```javascript
await chargingStation.registerStation(
    "STATION_001",
    "http://192.168.1.100:5000",
    ethers.parseEther("0.001"), // 0.001 SEI per watt
    1000, // 1000 watts capacity
    "123 Solar Street, San Francisco, CA",
    37774900, // latitude * 1e6 (microdegrees)
    -122419400 // longitude * 1e6 (microdegrees)
);
```

### Buy Power with Decimal Values

```javascript
// Calculate price for 0.5 watts at 0.25 power
const stationId = 1;
const watt = 500;  // 0.5 * 1000 (scaled)
const power = 250; // 0.25 * 1000 (scaled)

const price = await chargingBooking.calculatePrice(stationId, watt, power);

// Execute via UserWallet proxy
const buyPowerData = chargingBooking.interface.encodeFunctionData(
    'buyPower', 
    [user.address, stationId, watt, power]
);

await userWallet.executeTransaction(
    user.address,
    chargingBooking.address,
    price,
    buyPowerData
);
```

### Emergency Stop with Refund

```javascript
// Stop charging after consuming 0.3 watts (300 scaled)
const bookingId = 0;
const wattsConsumed = 300; // 0.3 * 1000

const emergencyStopData = chargingBooking.interface.encodeFunctionData(
    'emergencyStop',
    [user.address, bookingId, wattsConsumed]
);

await userWallet.executeTransaction(
    user.address,
    chargingBooking.address,
    0, // No payment for emergency stop
    emergencyStopData
);
```

## 🌐 Network Configuration

### Hardhat Configuration

```javascript
module.exports = {
    solidity: {
        version: "0.8.28",
        settings: {
            evmVersion: "cancun",
            optimizer: {
                enabled: true,
                runs: 200,   
            }
        }
    },
    networks: {
        testnet: {
            url: process.env.SEI_TESTNET_RPC_URL,
            accounts: [process.env.SEI_TESTNET_PRIVATE_KEY],
            chainId: 1328,
        },
    }
};
```

### SEI Testnet Details

- **Chain ID**: 1328
- **RPC URL**: https://evm-rpc-testnet.sei-apis.com
- **Explorer**: https://seitrace.com/?chain=atlantic-2
- **Faucet**: https://docs.sei.io/learn/faucet

## 📁 Project Structure

```
smartcontract/
├── contracts/                    # Solidity contracts
│   ├── ChargingBooking.sol      # Main booking and payment logic
│   ├── ChargingStation.sol      # Station registry and device URLs
│   └── UserWallet.sol           # User balance and transaction proxy
├── scripts/                     # Deployment scripts
│   └── deploy.js               # Main deployment script
├── test/                       # Comprehensive test suite
│   ├── charging.test.js        # Basic functionality tests
│   ├── device-control.test.js  # Device integration tests
│   └── emergency-stop.test.js  # Emergency scenarios tests
├── hardhat.config.js           # Hardhat configuration
├── package.json               # Dependencies and scripts
└── .env.example              # Environment template
```

## 🔍 Key Implementation Details

### Fixed-Point Arithmetic

```solidity
// All decimal values are scaled by 1000 for 3 decimal precision
uint256 public constant SCALE_FACTOR = 1000;

// Example: 0.005 watts → 5 (stored in contract)
// Example: 2.5 power → 2500 (stored in contract)

// Price calculation maintains precision:
// price = (watt * power * pricePerWatt) / (SCALE_FACTOR * SCALE_FACTOR)
```

### Gas Optimization

```solidity
// UserWallet uses realistic gas estimation
uint256 estimatedGasCost = 250000 * tx.gasprice;

// Execution with sufficient gas limit
(bool success, ) = target.call{gas: 250000, value: amount}(data);
```

### Event-Driven Device Control

```solidity
emit DeviceControlTriggered(
    bookingId,
    stationId,
    user,
    stationURL,
    watt,
    power,
    "/toggle/0.5/0.25"  // HTTP endpoint with decimal values
);
```

## 🔧 Troubleshooting

### Common Deployment Issues

**Gas estimation failed:**
```bash
# Solution: Increase gas limit in hardhat.config.js
gas: 6000000,
gasPrice: 20000000000
```

**Private key issues:**
```bash
# Verify private key format (should start with 0x)
SEI_TESTNET_PRIVATE_KEY=0x1234567890abcdef...
```

**Network connection problems:**
```bash
# Test RPC connection
curl -X POST -H "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
  https://evm-rpc-testnet.sei-apis.com
```

### Testing Issues

**Compilation errors:**
```bash
# Clear cache and recompile
npm run clean
npm run compile
```

**Test failures:**
```bash
# Run individual tests to isolate issues
npx hardhat test test/charging.test.js --verbose
```

### Contract Verification

After deployment, verify contracts on SEI explorer:

```bash
# Install verification plugin
npm install --save-dev @nomicfoundation/hardhat-verify

# Verify contract
npx hardhat verify --network testnet <CONTRACT_ADDRESS> <CONSTRUCTOR_ARGS>
```

## 📊 Gas Usage Estimates

| Operation | Estimated Gas | SEI Cost (estimate) |
|-----------|---------------|---------------------|
| Deploy UserWallet | ~800k gas | ~0.016 SEI |
| Deploy ChargingStation | ~1.2M gas | ~0.024 SEI |
| Deploy ChargingBooking | ~2.5M gas | ~0.050 SEI |
| User Deposit | ~50k gas | ~0.001 SEI |
| Register Station | ~150k gas | ~0.003 SEI |
| Buy Power | ~250k gas | ~0.005 SEI |
| Emergency Stop | ~200k gas | ~0.004 SEI |

## 🔐 Security Considerations

### Access Controls
- **UserWallet**: Only admin can execute transactions on behalf of users
- **Emergency Stop**: Only booking owner can stop their own sessions
- **Earnings Withdrawal**: Only station owners can withdraw their earnings

### Balance Protection
- **Overflow Protection**: SafeMath equivalent in Solidity 0.8.28+
- **Refund Validation**: Refunds cannot exceed original payment
- **Gas Estimation**: Realistic gas costs prevent balance drainage

### Input Validation
- **Parameter Bounds**: Watt and power values validated against station capacity
- **Address Validation**: Zero address checks on all critical functions
- **State Validation**: Booking status checks prevent invalid operations
