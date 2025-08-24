import { NextRequest, NextResponse } from 'next/server';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: number;
}

interface MCPResponse {
  response: string;
  tool_calls?: Array<{
    tool: string;
    args: any;
    result: any;
  }>;
}

const MCP_SERVER_URL = process.env.NEXT_PUBLIC_MCP_SERVER_URL || 'http://127.0.0.1:8080';

export async function POST(request: NextRequest) {
  try {
    const { message, userAddress, context, userLocation } = await request.json();

    if (!message) {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      );
    }

    // Enhanced system prompt for SEI Solar context with location support
    const locationInfo = userLocation
      ? `- User Location: Latitude ${userLocation.latitude}, Longitude ${userLocation.longitude} (accuracy: ${userLocation.accuracy}m)`
      : '- User Location: Not available (enable location services for nearest station finder)';

    const systemPrompt = `You are the AI assistant for SEI Solar, a decentralized EV charging network built on blockchain technology. Your role is to help users with:

1. **Station Discovery**: Help users find nearby charging stations, check availability, and understand pricing
2. **Wallet Management**: Assist with SEI token deposits, withdrawals, and balance inquiries
3. **Booking Support**: Guide users through the charging session booking process
4. **Technical Help**: Explain how the blockchain-based charging system works
5. **Account Issues**: Help with wallet connections, transaction problems, and general troubleshooting
6. **Battery Monitoring**: Check real-time battery capacity and status of charging stations
7. **Location Services**: Find nearest stations using user's location with Haversine distance calculations

Key Information:
- The platform uses SEI tokens for all payments (not ETH)
- All transactions are secured by blockchain technology
- Stations are solar-powered for sustainable energy
- Users can be either Station Owners (earn by providing charging) or EV Drivers (pay for charging)

Current user context:
- Wallet Address: ${userAddress || 'Not connected'}
${locationInfo}
- Context: ${context || 'General inquiry'}

Available Tools:
- get_station_battery_capacity(station_id): Get real-time battery info from charging station
- find_nearest_charging_station(user_latitude, user_longitude, max_results): Find closest stations using Haversine algorithm
- estimate_charging_time(station_id, energy_wh, power_rate): Estimate charging time for specific energy needs and power efficiency
- get_all_charging_points(): List all available charging stations with location data
- calculate_charging_price(station_id, watt, power): Calculate pricing for charging sessions - SUPPORTS DECIMAL VALUES (e.g., watt: 1.5, power: 2.3)
- buy_power_from_station(user_address, station_id, watt, power): Purchase power - SUPPORTS DECIMAL VALUES for watt and power
- stop_charging(user_address): Stop the user's most recent active charging session

📊 DECIMAL SUPPORT: The system now accepts decimal values for watt and power parameters!
- Examples: 1.5 watts, 2.75 power, 10.125 watts, 0.005 watts, 0.001 power
- Precision: Up to 3 decimal places supported (minimum: 0.001)
- Both integer and decimal values work seamlessly
- ACCEPT ANY VALUE: No matter how small (0.001, 0.005, etc.) - let the contract decide validity

When users ask for "nearest stations" or "stations near me", immediately use the find_nearest_charging_station tool with their location coordinates if available.
When users ask for "charging time", "how long", or "time estimate", use the estimate_charging_time tool with appropriate parameters.
When users ask to "stop charging" or "end session", use the stop_charging tool with their wallet address.
When users specify decimal values like "1.5 watts" or "2.3 power", pass them directly as decimal numbers (not strings).

EXAMPLES with decimal support (including very small values):
- "Calculate price for 1.5 watts" → use calculate_charging_price with watt: 1.5
- "Buy 2.75 watts power" → use buy_power_from_station with watt: 2.75, power: (appropriate decimal)
- "I need 10.125 watts from station 1" → use decimal values: 10.125
- "Buy 0.005 watts power" → use buy_power_from_station with watt: 0.005 (ACCEPT small values)
- "Test with 0.001 watts" → use watt: 0.001 (DO NOT reject small decimal values)

IMPORTANT: NEVER reject decimal values as "too small" - always attempt the tool call and let the blockchain contract handle validation.

IMPORTANT: When providing transaction hashes, always format them as clickable links: [View Transaction](https://seitrace.com/tx/HASH_HERE)

Always be helpful, concise, and focused on the user's needs. Use the available tools when needed to provide real-time information about balances, stations, or bookings. Respond in a friendly, professional tone.`;

    // Prepare the chat request for MCP server
    const mcpRequest = {
      message: message,
      system_prompt: systemPrompt,
      user_address: userAddress,
      user_location: userLocation,
      context: {
        page: context?.page || 'chat',
        wallet_connected: !!userAddress,
        location_available: !!userLocation,
        additional_context: context
      }
    };

    // Make request to MCP server
    const mcpResponse = await fetch(`${MCP_SERVER_URL}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(mcpRequest),
      // Add timeout
      signal: AbortSignal.timeout(30000), // 30 second timeout
    });

    if (!mcpResponse.ok) {
      console.error('MCP Server responded with error:', mcpResponse.status);
      
      // Fallback response when MCP server is unavailable
      const fallbackResponse = generateFallbackResponse(message, userAddress);
      
      return NextResponse.json({
        response: fallbackResponse,
        fallback: true,
        tool_calls: []
      });
    }

    const responseData: MCPResponse = await mcpResponse.json();

    return NextResponse.json({
      response: responseData.response,
      tool_calls: responseData.tool_calls || [],
      fallback: false
    });

  } catch (error) {
    console.error('Chat API error:', error);

    // Return fallback response on error
    const { message, userAddress } = await request.json().catch(() => ({ message: '', userAddress: null }));
    const fallbackResponse = generateFallbackResponse(message, userAddress);

    return NextResponse.json({
      response: fallbackResponse,
      fallback: true,
      tool_calls: [],
      error: 'MCP server unavailable - using fallback response'
    });
  }
}

function generateFallbackResponse(message: string, userAddress: string | null): string {
  const lowerMessage = message.toLowerCase();

  // Wallet-related queries
  if (lowerMessage.includes('balance') || lowerMessage.includes('wallet')) {
    if (!userAddress) {
      return "To check your wallet balance, please connect your MetaMask wallet first. Once connected, I can help you view your SEI token balance and manage deposits/withdrawals.";
    }
    return "I'd love to help you check your wallet balance! However, I'm currently unable to connect to the blockchain. Please try refreshing the page or check the wallet section of your dashboard directly.";
  }

  // Station-related queries
  if (lowerMessage.includes('station') || lowerMessage.includes('charging') || lowerMessage.includes('find')) {
    return "You can find nearby charging stations in the 'Find Stations' tab of your dashboard. The stations are sorted by distance and show real-time availability, pricing in SEI tokens, and power capacity. Each station is solar-powered for sustainable charging!";
  }

  // Booking-related queries
  if (lowerMessage.includes('book') || lowerMessage.includes('session') || lowerMessage.includes('charge')) {
    return "To book a charging session: 1) Go to 'Find Stations', 2) Select a nearby station, 3) Click 'Book Now', 4) Confirm the transaction with SEI tokens. Make sure you have sufficient balance in your wallet for the charging session.";
  }

  // Deposit/withdraw queries
  if (lowerMessage.includes('deposit') || lowerMessage.includes('withdraw')) {
    return "You can manage your SEI tokens in the 'Wallet' tab. To deposit: connect your wallet and transfer SEI tokens. To withdraw: specify the amount and confirm the transaction. All transactions are secured by blockchain technology.";
  }

  // Station owner queries
  if (lowerMessage.includes('owner') || lowerMessage.includes('register') || lowerMessage.includes('earn')) {
    return "As a Station Owner, you can register solar charging stations, set your pricing, and earn SEI tokens from each charging session. Use the Owner Dashboard to register stations on the interactive map and monitor your earnings.";
  }

  // General help
  if (lowerMessage.includes('help') || lowerMessage.includes('how') || lowerMessage.includes('what')) {
    return "SEI Solar is a decentralized EV charging network where you can:\n\n🔋 **EV Drivers**: Find stations, book charging sessions, manage SEI tokens\n⚡ **Station Owners**: Register stations, earn from charging sessions\n🌱 **Sustainable**: All stations powered by solar energy\n💎 **Blockchain**: Secure, transparent payments with SEI tokens\n\nWhat specific area would you like help with?";
  }

  // Default response
  return "Hello! I'm your SEI Solar AI assistant. I can help you with finding charging stations, managing your SEI wallet, booking charging sessions, and understanding our blockchain-powered platform. What would you like to know?";
}