# SEI Solar EV Charging Network - Frontend Application

A comprehensive Next.js frontend application for the SEI Solar decentralized EV charging network, featuring role-based dashboards, Web3 integration, AI assistance, and real-time blockchain interactions with comprehensive decimal value support.

## 🌟 Key Features

### 🏠 Landing Experience
- **Modern Design**: Gradient animations, glassmorphism effects, and responsive mobile-first layout
- **MetaMask Integration**: Seamless wallet connection with automatic SEI network switching
- **Feature Showcase**: Interactive cards highlighting platform capabilities
- **Real-time Statistics**: Dynamic platform metrics and engagement data

### 👥 Role-Based Architecture
- **Station Owners**: Register stations, manage pricing, track earnings, withdraw profits
- **EV Drivers**: Discover stations, book sessions, manage wallet, get AI assistance
- **Intuitive Navigation**: Clean interface for role selection after wallet connection

### ⚡ Station Owner Dashboard
- **Station Registration**: Interactive form with optional Mapbox integration for location selection
- **Real-time Earnings**: Live earnings dashboard with transparent withdrawal functionality  
- **Station Management**: Comprehensive view of registered stations with detailed analytics
- **Performance Metrics**: Power capacity, pricing optimization, and booking statistics

### 🔋 EV Driver Dashboard  
- **Station Discovery**: Find nearby stations with GPS-based distance calculations and advanced filtering
- **Wallet Management**: Deposit/withdraw SEI tokens with real-time balance updates and transaction history
- **Booking System**: Reserve charging sessions with transparent pricing and instant confirmations
- **Charging History**: Track past sessions, expenses, and energy consumption
- **AI Assistant**: Intelligent chatbot for personalized help and blockchain queries

### 🤖 AI Chatbot Integration
- **Server-side Implementation**: Next.js API routes connecting to MCP server via HTTP
- **Context-aware Conversations**: AI understands user role, wallet balance, location, and current page
- **Fallback System**: Graceful degradation when MCP server is unavailable
- **Real-time Tool Execution**: Direct blockchain queries, transaction assistance, and device communication
- **Decimal Value Support**: Full support for small decimal values (0.005 watts, 0.001 power)
- **Location Services**: Automatic location detection for proximity-based station searches

### 🌐 Comprehensive Blockchain Integration
- **Multi-Contract Architecture**: UserWallet, ChargingStation, and ChargingBooking contracts
- **Dynamic Contract Loading**: Automatically loads contract addresses and ABIs from deployment artifacts
- **Transaction Lifecycle**: Complete transaction management with loading states, error handling, and confirmations
- **Real-time Updates**: Automatic data refresh after blockchain operations
- **SEI Network Focus**: Optimized for SEI blockchain with proper network validation

## 🛠 Technology Stack

- **Framework**: Next.js 15.5.0 with App Router and Turbopack
- **Language**: TypeScript for comprehensive type safety
- **Styling**: Tailwind CSS 4.0 with custom animations and glassmorphism effects
- **Blockchain**: ethers.js 6.8+ for Web3 interactions and contract management
- **State Management**: React Context API for wallet and contract state
- **UI Components**: Custom components with Lucide React icons
- **Maps** (Optional): Mapbox GL JS for interactive location selection
- **API Integration**: Next.js API routes for MCP communication
- **Markdown**: React Markdown with GitHub Flavored Markdown support

## 📁 Project Architecture

```
ui/
├── src/
│   ├── app/                           # Next.js 15 App Router
│   │   ├── api/                      # Server-side API endpoints
│   │   │   ├── chat/route.ts         # AI chatbot API with MCP integration
│   │   │   └── openai/route.ts       # OpenAI API proxy for AI responses
│   │   ├── dashboard/                # Role-based dashboard pages
│   │   │   ├── page.tsx             # Role selection dashboard
│   │   │   ├── owner/page.tsx       # Station owner comprehensive dashboard
│   │   │   └── consumer/page.tsx    # EV driver dashboard with AI chat
│   │   ├── layout.tsx               # Root layout with providers and metadata
│   │   ├── page.tsx                 # Landing page with wallet connection
│   │   └── globals.css              # Global styles, animations, and utilities
│   ├── components/                   # Reusable UI components
│   │   ├── AdvancedChatInterface.tsx # Full-featured AI chatbot component
│   │   ├── ChatInterface.tsx        # Simplified chat component
│   │   └── MapboxMap.tsx           # Interactive map component (optional)
│   ├── contexts/                    # React Context providers
│   │   └── WalletContext.tsx       # Wallet state management and Web3 integration
│   ├── contracts/                  # Smart contract artifacts (auto-generated)
│   │   ├── deployments.json        # Contract addresses for all networks
│   │   ├── UserWallet_address.json # UserWallet deployment info
│   │   ├── UserWallet_contract.json # UserWallet ABI
│   │   ├── ChargingStation_*.json  # ChargingStation contract files
│   │   └── ChargingBooking_*.json  # ChargingBooking contract files
│   └── lib/                        # Utility libraries
│       ├── contracts.ts           # Contract interaction utilities
│       └── utils.ts              # Helper functions and utilities
├── public/                         # Static assets and icons
├── .env.local.example             # Environment configuration template
├── package.json                   # Dependencies and build scripts
├── tsconfig.json                  # TypeScript configuration
├── tailwind.config.js            # Tailwind CSS configuration
└── next.config.ts                # Next.js configuration with Turbopack
```

## 🚀 Installation & Setup

### Prerequisites
- **Node.js 18+** with npm or yarn
- **MetaMask** browser extension
- **Local blockchain network** (Hardhat/Ganache) on port 8545 OR SEI testnet access
- **MCP server** running on port 8080 (see `mcp-server/README.md`)
- **Smart contracts** deployed (see `smartcontract/README.md`)

### Step-by-Step Installation

1. **Install Dependencies**
   ```bash
   cd ui
   npm install
   
   # Or with yarn
   yarn install
   ```

2. **Environment Configuration**
   ```bash
   cp .env.example .env
   ```
   
   Configure your `.env.local` file:
   ```env
   # Mapbox Configuration (Optional - for interactive maps)
   NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN=pk.your_mapbox_token_here

   # MCP Server Configuration  
   NEXT_PUBLIC_MCP_SERVER_URL=http://127.0.0.1:8080

   # Blockchain Configuration
   NEXT_PUBLIC_CHAIN_ID=31337                    # 31337 for local, 1328 for SEI testnet
   NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8545     # Local Hardhat node

   # SEI Testnet Configuration (alternative)
   # NEXT_PUBLIC_CHAIN_ID=1328
   # NEXT_PUBLIC_RPC_URL=https://evm-rpc-testnet.sei-apis.com

   # OpenAI API Configuration (for AI chatbot)
   OPENAI_API_KEY=your_openai_api_key_here
   ```

3. **Start Development Server**
   ```bash
   npm run dev
   
   # Or with Turbopack for faster builds
   npm run dev -- --turbopack
   ```

4. **Access Application**
   Visit [http://localhost:3000](http://localhost:3000)


## 🧪 Testing & Development

### Development Workflow
```bash
# Start development server
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Lint code
npm run lint
```



## 🚀 Deployment

### Production Build
```bash
npm run build
npm start
```