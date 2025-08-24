'use client';

import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface Message {
  type: 'user' | 'assistant' | 'system' | 'tool-call';
  content: string;
  timestamp: string;
  toolResults?: Array<{
    toolName: string;
    result: string;
    expanded: boolean;
  }>;
}

interface AdvancedChatInterfaceProps {
  context?: any;
  className?: string;
}

export default function AdvancedChatInterface({ context, className = '' }: AdvancedChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      type: 'system',
      content: 'Welcome to the SEI Solar Charging Station AI Assistant! I\'m here to help you with EV charging operations on the SEI blockchain. How can I assist you today?',
      timestamp: new Date().toLocaleTimeString()
    }
  ]);
  const [currentMessage, setCurrentMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [messageCount, setMessageCount] = useState(0);
  const [conversationHistory, setConversationHistory] = useState<Array<{role: string, content: string}>>([]);
  const [pendingToolResults, setPendingToolResults] = useState<Array<{toolName: string, result: string}>>([]);
  const [userLocation, setUserLocation] = useState<{latitude: number, longitude: number, accuracy: number} | null>(null);
  const [locationPermission, setLocationPermission] = useState<'granted' | 'denied' | 'prompt' | 'unknown'>('unknown');
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const mcpServerUrl = process.env.NEXT_PUBLIC_MCP_SERVER_URL || 'http://127.0.0.1:8080';

  useEffect(() => {
    connectToMCPServer();
    requestLocation();
    scrollToBottom();
    
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const connectToMCPServer = () => {
    try {
      eventSourceRef.current = new EventSource(`${mcpServerUrl}/sse`);

      eventSourceRef.current.onopen = () => {
        setIsConnected(true);
      };

      eventSourceRef.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          handleMCPServerMessage(data);
        } catch (e) {
          console.error('Error parsing SSE message:', e);
        }
      };

      eventSourceRef.current.onerror = (error) => {
        setIsConnected(false);
        console.error('SSE connection error:', error);
      };

    } catch (error) {
      console.error('Failed to connect to MCP server:', error);
      setIsConnected(false);
    }
  };

  const requestLocation = () => {
    if (!navigator.geolocation) {
      setLocationPermission('denied');
      console.log('Geolocation is not supported by this browser.');
      return;
    }

    // Check current permission state
    if ('permissions' in navigator) {
      navigator.permissions.query({ name: 'geolocation' }).then((permission) => {
        setLocationPermission(permission.state as any);
        
        if (permission.state === 'granted') {
          getCurrentPosition();
        } else if (permission.state === 'prompt') {
          getCurrentPosition();
        }
        
        permission.addEventListener('change', () => {
          setLocationPermission(permission.state as any);
          if (permission.state === 'granted') {
            getCurrentPosition();
          }
        });
      });
    } else {
      getCurrentPosition();
    }
  };

  const getCurrentPosition = () => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        setUserLocation({ latitude, longitude, accuracy });
        setLocationPermission('granted');
        console.log('Location obtained:', { latitude, longitude, accuracy });
      },
      (error) => {
        console.error('Error getting location:', error);
        setLocationPermission('denied');
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 300000
      }
    );
  };

  const handleMCPServerMessage = (data: any) => {
    console.log('MCP Server message:', data);
    if (data.type === 'heartbeat') {
      setIsConnected(data.blockchain_connected);
    }
  };

  const addMessage = (type: Message['type'], content: string) => {
    const newMessage: Message = {
      type,
      content,
      timestamp: new Date().toLocaleTimeString()
    };
    setMessages(prev => [...prev, newMessage]);
  };

  const addSystemMessage = (content: string, type: Message['type'] = 'system') => {
    addMessage(type, content);
  };

  const adjustTextareaHeight = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
    }
  };

  const sendMessage = async () => {
    const message = currentMessage.trim();
    if (!message) {
      return;
    }

    addMessage('user', message);
    setCurrentMessage('');
    setIsTyping(true);

    // Add to conversation history
    const newHistory = [...conversationHistory, { role: 'user', content: message }];
    setConversationHistory(newHistory);

    try {
      const response = await callOpenAI(newHistory);
      setIsTyping(false);
      
      if (typeof response === 'object' && response.interpretation) {
        // Response with tool results
        const newMessage: Message = {
          type: 'assistant',
          content: response.interpretation,
          timestamp: new Date().toLocaleTimeString(),
          toolResults: response.toolResults
        };
        setMessages(prev => [...prev, newMessage]);
      } else {
        // Simple text response
        addMessage('assistant', typeof response === 'string' ? response : JSON.stringify(response));
      }
      setMessageCount(prev => prev + 1);
    } catch (error: any) {
      setIsTyping(false);
      addSystemMessage(`Error: ${error.message}`, 'system');
    }
  };

  const callOpenAI = async (history: Array<{role: string, content: string}>) => {
    // Build location context string
    const locationContext = userLocation
      ? `
CURRENT USER LOCATION: Latitude ${userLocation.latitude}, Longitude ${userLocation.longitude}
- Location accuracy: ${userLocation.accuracy}m
- When user asks for "nearest stations", automatically use these coordinates
- Never ask user for their location - you already have it!`
      : `
USER LOCATION: Not available (location services disabled)
- User must enable location services for location-based features
- If they ask for nearest stations, guide them to enable location access`;

    const systemPrompt = `You are an AI assistant for the SEI Solar Charging Station system. You help users with EV charging operations on the SEI blockchain. And you should tell all the values in SEI only not ETH

${locationContext}

IMPORTANT: You MUST call tools immediately when users request information, don't just talk about calling them!. You should ask the user SEI address initially , And you should tell all the values in SEI only not ETH

Available MCP server tools:
- health_check: Check server and blockchain health (no parameters needed)
- get_server_info: Get server information (no parameters needed)
- get_all_charging_points: List all charging stations (no parameters needed)
- calculate_charging_price: Calculate charging price - requires: {"station_id": number, "watt": number/decimal, "power": number/decimal}
- get_user_balance: Get user wallet balance - requires: {"user_address": "0x..."}
- get_gas_estimates: Get gas price estimates (no parameters needed)
- get_user_bookings: Get user's booking history - requires: {"user_address": "0x..."}
- get_booking_details: Get specific booking details - requires: {"booking_id": number}
- get_booking_count: Get total number of bookings (no parameters needed)
- prebook_charging_session: Create a prebooking - requires: {"user_address": "0x...", "station_id": number, "watt": number/decimal, "power": number/decimal}
- buy_power_from_station: Purchase power - requires: {"user_address": "0x...", "station_id": number, "watt": number/decimal, "power": number/decimal}
- stop_charging: Smart stop charging session - requires: {"user_address": "0x..."}
- complete_charging_workflow: Complete workflow - requires: {"user_address": "0x...", "station_id": number, "watt": number/decimal, "power": number/decimal, "charging_duration_seconds": number}
- get_station_battery_capacity: Get real-time battery info from station - requires: {"station_id": number}
- find_nearest_charging_station: Find closest stations using Haversine algorithm - requires: {"user_latitude": number, "user_longitude": number, "max_results": number}
- estimate_charging_time: Estimate charging time for energy needs - requires: {"station_id": number, "energy_wh": number, "power_rate": number}

NEW FEATURES & DECIMAL SUPPORT:
- 📊 DECIMAL VALUES: Now supports decimal numbers for watt and power (e.g., 1.5 watts, 2.75 power, 0.005 watts)
- Precision: Up to 3 decimal places supported (1.125, 2.750, 0.001, etc.)
- ACCEPT ALL VALUES: Never reject small decimals (0.001, 0.005) as "too low" - let blockchain decide validity
- When users ask for "nearest stations", "stations near me", or "closest charging stations", use find_nearest_charging_station tool
- When users ask about "battery status", "station capacity", or "battery level", use get_station_battery_capacity tool
- When users ask about "charging time", "how long to charge", or "time estimate", use estimate_charging_time tool
- The system can automatically detect user location for proximity-based searches
- All distance calculations use the precise Haversine formula for great-circle distances
- Time estimates use station-specific power rates and energy requirements

CRITICAL TOOL CALL RULES:
1. ALWAYS call tools immediately when users ask for data (balance, bookings, etc.)
2. Use the EXACT format: [TOOL_CALL:tool_name{"param":"value"}]
3. For tools with no parameters, use: [TOOL_CALL:tool_name{}]

LOCATION-AWARE EXAMPLES:
${userLocation ? `
- User asks "find nearest stations" → Immediately respond: [TOOL_CALL:find_nearest_charging_station{"user_latitude":${userLocation.latitude},"user_longitude":${userLocation.longitude},"max_results":5}]
- User asks "stations near me" → Immediately respond: [TOOL_CALL:find_nearest_charging_station{"user_latitude":${userLocation.latitude},"user_longitude":${userLocation.longitude},"max_results":5}]
- User asks "closest charging point" → Immediately respond: [TOOL_CALL:find_nearest_charging_station{"user_latitude":${userLocation.latitude},"user_longitude":${userLocation.longitude},"max_results":3}]` : `
- User asks "find nearest stations" → Respond: "I need location access to find nearby stations. Please enable location services."`
}

OTHER EXAMPLES:
- User asks "what is my balance" → Immediately respond: [TOOL_CALL:get_user_balance{"user_address":"ask from user"}]
- User asks "stop charging" → Immediately respond: [TOOL_CALL:stop_charging{"user_address":"ask from user"}]
- User asks "show charging stations" → Immediately respond: [TOOL_CALL:get_all_charging_points{}]
- User asks "buy 0.005 watts from station 0" → Immediately respond: [TOOL_CALL:buy_power_from_station{"user_address":"ask from user","station_id":0,"watt":0.005,"power":1}] (NEVER reject small values!)
- User asks "calculate price for 0.001 watts" → Immediately respond: [TOOL_CALL:calculate_charging_price{"station_id":1,"watt":0.001,"power":1}] (ACCEPT tiny decimals!)
- User asks "check battery of station 1" → Immediately respond: [TOOL_CALL:get_station_battery_capacity{"station_id":1}]
- User asks "how long to charge 1000Wh at station 1" → Immediately respond: [TOOL_CALL:estimate_charging_time{"station_id":1,"energy_wh":1000,"power_rate":0.8}]
- User asks "charging time estimate" → Immediately respond: [TOOL_CALL:estimate_charging_time{"station_id":1,"energy_wh":500,"power_rate":0.7}]

Never say "I will check" or "hold on" - just call the tool directly!
CRITICAL: NEVER reject decimal values as "too small" or "too low" - always attempt the tool call regardless of value size!

IMPORTANT SEI BLOCKCHAIN CONTEXT:
- This is the SEI blockchain - ALL amounts must be displayed in SEI tokens ONLY
- Never mention ETH, Ethereum, or wei - only SEI and SEI denominations
- Format all amounts as "X.XXXX SEI" for user clarity (e.g., "1.2500 SEI")
- Gas prices should be described as "SEI gas fees"
- All transactions are SEI blockchain transactions
- When showing balances, prices, or refunds - always use SEI units
- Default user address: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`;

    const messages = [
      { role: 'system', content: systemPrompt },
      ...history.slice(-10) // Keep last 10 messages for context
    ];

    const response = await fetch('/api/openai', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messages: messages,
        model: 'gpt-4o-mini',
        max_tokens: 1000,
        temperature: 0.3
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content;

    // Check if the response contains a tool call
    if (content.includes('[TOOL_CALL:')) {
      // New simplified format: [TOOL_CALL:tool_name{"param":"value"}] or [TOOL_CALL:tool_name{}]
      let toolCallMatch = content.match(/\[TOOL_CALL:(\w+)(\{.*?\})\]/);
      if (toolCallMatch) {
        const toolName = toolCallMatch[1];
        const parametersString = toolCallMatch[2];
        try {
          const parameters = JSON.parse(parametersString);
          return await executeToolCall(toolName, parameters);
        } catch (e) {
          console.error('Error parsing JSON parameters:', e);
          return `Error: Invalid JSON parameters for tool ${toolName}: ${parametersString}`;
        }
      }
      
      // Fallback: try old format with spaces
      toolCallMatch = content.match(/\[TOOL_CALL:\s*(\w+)\s*(\{.*\})\s*\]/);
      if (toolCallMatch) {
        const toolName = toolCallMatch[1];
        const parametersString = toolCallMatch[2];
        try {
          const parameters = JSON.parse(parametersString);
          return await executeToolCall(toolName, parameters);
        } catch (e) {
          console.error('Error parsing JSON parameters:', e);
          return `Error: Invalid JSON parameters for tool ${toolName}`;
        }
      }

      // Legacy format support
      toolCallMatch = content.match(/\[TOOL_CALL:\s*(\w+)\s*\(([^)]*)\)\s*\]/);
      if (toolCallMatch) {
        const toolName = toolCallMatch[1];
        const paramValue = toolCallMatch[2].trim();

        // Check if the parameter is already a JSON object
        let params = {};
        if (paramValue.startsWith('{') && paramValue.endsWith('}')) {
          try {
            params = JSON.parse(paramValue);
          } catch (e) {
            console.error('Failed to parse JSON parameter:', e);
            params = {};
          }
        } else {
          const cleanValue = paramValue.replace(/"/g, '');
          if (toolName === 'get_user_balance' && cleanValue) {
            params = { "user_address": cleanValue };
          } else if (toolName === 'get_booking_details' && cleanValue) {
            params = { "booking_id": parseInt(cleanValue) };
          } else if (toolName === 'calculate_charging_price' && cleanValue) {
            params = {
              "station_id": 1,
              "watt": 100,
              "power": 50
            };
          }
        }

        return await executeToolCall(toolName, params);
      }
      
      console.error('Tool call detected but no pattern matched. Content:', content);
      return `Error: Detected tool call but couldn't parse format. Content: ${content}`;
    }

    // Add to conversation history
    setConversationHistory(prev => [...prev, { role: 'assistant', content }]);

    return content;
  };

  const executeToolCall = async (toolName: string, parameters: any) => {
    try {
      let params = parameters;
      if (typeof parameters === 'string') {
        try {
          params = JSON.parse(parameters);
        } catch (e) {
          params = {};
        }
      }

      console.log(`Executing tool ${toolName} with parameters:`, params);

      const response = await fetch(`${mcpServerUrl}/api/tools/${toolName}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(params)
      });

      if (!response.ok) {
        throw new Error(`Tool call failed: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();

      if (result.success) {
        const toolResult = JSON.stringify(result.result, null, 2);
        
        // Store tool result for later attachment to AI response
        setPendingToolResults(prev => [...prev, { toolName, result: toolResult }]);

        // Add tool result to conversation and get AI interpretation
        const newHistory = [
          ...conversationHistory,
          { role: 'system', content: `Tool result for ${toolName}: ${JSON.stringify(result.result)}` }
        ];
        setConversationHistory(newHistory);

        return await getToolInterpretation(toolName, result.result);
      } else {
        throw new Error(result.error || 'Tool execution failed');
      }

    } catch (error: any) {
      console.error(`Tool call failed: ${error.message}`);
      throw error;
    }
  };

  const getToolInterpretation = async (toolName: string, result: any) => {
    if (result.error) {
      let errorInterpretation = `Tool Error (${toolName}): ${result.error}`;
      if (result.note) {
        errorInterpretation += `\nNote: ${result.note}`;
      }
      if (result.example) {
        errorInterpretation += `\nExample usage: ${JSON.stringify(result.example, null, 2)}`;
      }

      setConversationHistory(prev => [...prev, { role: 'assistant', content: errorInterpretation }]);
      return errorInterpretation;
    }

    const interpretationPrompt = `Interpret this tool result for the user in a concise, helpful way. Tool: ${toolName}, Result: ${JSON.stringify(result)}`;

    const response = await fetch('/api/openai', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: 'You are a helpful interpreter of blockchain tool results. Provide concise, accurate interpretations.' },
          { role: 'user', content: interpretationPrompt }
        ],
        model: 'gpt-4o-mini',
        max_tokens: 500,
        temperature: 0.2
      })
    });

    if (response.ok) {
      const data = await response.json();
      const interpretation = data.choices[0].message.content;

      setConversationHistory(prev => [...prev, { role: 'assistant', content: interpretation }]);
      
      // Attach pending tool results to the interpretation
      const toolResults = pendingToolResults.map(tr => ({
        ...tr,
        expanded: false
      }));
      setPendingToolResults([]);

      return { interpretation, toolResults };
    } else {
      const toolResults = pendingToolResults.map(tr => ({
        ...tr,
        expanded: false
      }));
      setPendingToolResults([]);
      
      return {
        interpretation: `Tool executed successfully. Raw result: ${JSON.stringify(result, null, 2)}`,
        toolResults
      };
    }
  };

  const toggleToolResult = (messageIndex: number, toolIndex: number) => {
    setMessages(prev => prev.map((msg, idx) =>
      idx === messageIndex
        ? {
            ...msg,
            toolResults: msg.toolResults?.map((tool, tIdx) =>
              tIdx === toolIndex ? { ...tool, expanded: !tool.expanded } : tool
            )
          }
        : msg
    ));
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className={`flex flex-col bg-gray-900 rounded-xl overflow-hidden ${className}`} style={{ height: '100vh' }}>
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 to-purple-800 text-white p-3 text-center">
        <h1 className="text-sm font-bold mb-1">🔋 SEI Solar Charging Station</h1>
        <p className="text-purple-100 text-xs">MCP-Powered AI Assistant for EV Charging</p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-gray-800">
        {messages.map((message, index) => (
          <div
            key={index}
            className={`max-w-[85%] p-3 rounded-xl animate-fadeIn text-sm ${
              message.type === 'user'
                ? 'bg-gradient-to-r from-purple-600 to-purple-700 text-white ml-auto text-right'
                : message.type === 'assistant'
                ? 'bg-white text-gray-800 shadow-md'
                : message.type === 'system'
                ? 'bg-yellow-100 border border-yellow-300 text-yellow-800 text-center text-xs mx-auto'
                : 'bg-gray-100 border-l-4 border-purple-500 text-gray-800 font-mono text-xs'
            }`}
          >
            <div className="whitespace-pre-wrap break-words text-sm">
              {message.type === 'assistant' ? (
                <div className="prose prose-sm max-w-none prose-headings:text-sm prose-headings:text-gray-800 prose-p:text-sm prose-p:text-gray-800 prose-strong:text-gray-800 prose-code:text-xs prose-code:text-purple-600 prose-pre:bg-gray-100 prose-pre:text-xs prose-pre:text-gray-800">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {message.content}
                  </ReactMarkdown>
                </div>
              ) : (
                message.content
              )}
            </div>
            
            {/* Tool Results Section */}
            {message.toolResults && message.toolResults.length > 0 && (
              <div className="mt-2 space-y-1">
                {message.toolResults.map((toolResult, toolIndex) => (
                  <div key={toolIndex} className="border border-gray-300 rounded-md bg-gray-50">
                    <button
                      onClick={() => toggleToolResult(index, toolIndex)}
                      className="w-full px-2 py-1.5 text-left text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-t-md flex items-center justify-between"
                    >
                      <span className="flex items-center gap-1">
                        <span className="text-xs">🔧</span>
                        <span className="text-xs">{toolResult.toolName} result</span>
                      </span>
                      {toolResult.expanded ? (
                        <ChevronDown className="w-3 h-3" />
                      ) : (
                        <ChevronRight className="w-3 h-3" />
                      )}
                    </button>
                    {toolResult.expanded && (
                      <div className="px-2 py-1.5 border-t border-gray-300 bg-white">
                        <pre className="text-xs text-gray-700 whitespace-pre-wrap overflow-auto max-h-32">
                          {toolResult.result}
                        </pre>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            
            <div className={`text-xs mt-1 ${message.type === 'user' ? 'text-purple-200' : 'text-gray-400'}`}>
              {message.timestamp}
            </div>
          </div>
        ))}
        {isTyping && (
          <div className="flex items-center text-gray-500 text-xs">
            <div className="flex space-x-1 mr-2">
              <div className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce"></div>
              <div className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
              <div className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
            </div>
            AI is thinking...
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-3 bg-gray-900 border-t border-gray-700">
        <div className="flex gap-2 items-end">
          <textarea
            ref={textareaRef}
            value={currentMessage}
            onChange={(e) => {
              setCurrentMessage(e.target.value);
              adjustTextareaHeight();
            }}
            onKeyPress={handleKeyPress}
            placeholder="Ask me about charging stations, bookings, or wallet operations..."
            className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-xl text-white text-sm resize-none focus:ring-2 focus:ring-purple-500 focus:border-transparent min-h-[32px] max-h-[80px]"
            rows={1}
          />
          <button
            onClick={sendMessage}
            disabled={!currentMessage.trim() || isTyping}
            className="px-4 py-2 bg-gradient-to-r from-purple-600 to-purple-700 text-white rounded-xl text-sm font-medium hover:from-purple-700 hover:to-purple-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Send
          </button>
        </div>
      </div>

      {/* Status */}
      <div className="px-3 py-1.5 bg-gray-800 border-t border-gray-700 flex justify-between items-center text-xs text-gray-400">
        <div className="flex items-center gap-1.5">
          <div className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
          <span>{isConnected ? 'Connected' : 'Disconnected'}</span>
        </div>
        <div>{messageCount} msgs</div>
      </div>
    </div>
  );
}