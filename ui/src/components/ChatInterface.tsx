'use client';

import { useState, useEffect, useRef } from 'react';
import { useWallet } from '@/contexts/WalletContext';
import { Bot, Send, User, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  tool_calls?: Array<{
    tool: string;
    args: any;
    result: any;
  }>;
  fallback?: boolean;
  error?: string;
}

interface ChatInterfaceProps {
  context?: {
    page?: string;
    additional_context?: any;
  };
  className?: string;
}

export default function ChatInterface({ context, className = '' }: ChatInterfaceProps) {
  const { address } = useWallet();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(true);
  const [userLocation, setUserLocation] = useState<{latitude: number, longitude: number, accuracy: number} | null>(null);
  const [locationPermission, setLocationPermission] = useState<'granted' | 'denied' | 'prompt' | 'unknown'>('unknown');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Request geolocation on component mount
    requestLocation();
    
    // Add welcome message
    const welcomeMessage: Message = {
      id: 'welcome-' + Date.now(),
      role: 'assistant',
      content: `Hello! 👋 I'm your SEI Solar AI assistant. I can help you with:

🔋 **Finding charging stations** - Discover nearby solar-powered EV charging stations
💰 **Managing your wallet** - Check balances, deposit/withdraw SEI tokens
📅 **Booking sessions** - Guide you through the charging process
⚡ **Station management** - Help station owners with registration and earnings
🔧 **Technical support** - Troubleshoot issues and answer questions
📍 **Location services** - Find nearest stations based on your location

${address
  ? `I can see your wallet (${address.slice(0, 6)}...${address.slice(-4)}) is connected.`
  : 'Connect your wallet to access personalized features.'
}

${userLocation
  ? '📍 Location services are enabled - I can find nearest stations for you!'
  : '📍 Enable location services to find charging stations near you.'
}

What would you like help with?`,
      timestamp: Date.now()
    };

    setMessages([welcomeMessage]);
  }, [address, userLocation]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
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
          // Request permission by attempting to get position
          getCurrentPosition();
        }
        
        // Listen for permission changes
        permission.addEventListener('change', () => {
          setLocationPermission(permission.state as any);
          if (permission.state === 'granted') {
            getCurrentPosition();
          }
        });
      });
    } else {
      // Fallback for browsers without permissions API
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
        
        // Add a message about location access
        const locationErrorMessage: Message = {
          id: 'location-error-' + Date.now(),
          role: 'assistant',
          content: `📍 **Location Access**: I couldn't access your location. To find nearby charging stations:

• **Enable location services** in your browser settings
• **Allow location access** when prompted
• **Manual search**: Tell me your city/area and I can help you find stations

You can still use all other features without location access!`,
          timestamp: Date.now()
        };
        
        setMessages(prev => [...prev, locationErrorMessage]);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 300000 // Cache location for 5 minutes
      }
    );
  };

  const refreshLocation = () => {
    if (navigator.geolocation) {
      getCurrentPosition();
    }
  };

  const sendMessage = async () => {
    if (!inputMessage.trim() || isLoading) return;

    const userMessage: Message = {
      id: 'user-' + Date.now(),
      role: 'user',
      content: inputMessage.trim(),
      timestamp: Date.now()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: userMessage.content,
          userAddress: address,
          userLocation: userLocation,
          context: context
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to send message');
      }

      const data = await response.json();
      
      const assistantMessage: Message = {
        id: 'assistant-' + Date.now(),
        role: 'assistant',
        content: data.response,
        timestamp: Date.now(),
        tool_calls: data.tool_calls,
        fallback: data.fallback,
        error: data.error
      };

      setMessages(prev => [...prev, assistantMessage]);
      setIsConnected(!data.fallback);
      
    } catch (error) {
      console.error('Error sending message:', error);
      
      const errorMessage: Message = {
        id: 'error-' + Date.now(),
        role: 'assistant',
        content: `I'm sorry, I'm having trouble connecting to my systems right now. Here are some things you can try:

• **Wallet Issues**: Check the Wallet tab to view balances and manage SEI tokens
• **Find Stations**: Use the Find Stations tab to discover nearby charging locations  
• **Bookings**: View your charging sessions in the My Bookings tab
• **Technical Help**: Try refreshing the page or reconnecting your wallet

Is there something specific I can help guide you to?`,
        timestamp: Date.now(),
        error: 'Connection failed'
      };

      setMessages(prev => [...prev, errorMessage]);
      setIsConnected(false);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const formatMessage = (content: string) => {
    // Convert markdown-style formatting to HTML
    return content
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`(.*?)`/g, '<code class="bg-gray-800 px-1 py-0.5 rounded text-sm">$1</code>')
      .replace(/\n/g, '<br/>')
      .replace(/🔋|💰|📅|⚡|🔧|👋|🌱|💎/g, '<span class="text-lg">$&</span>');
  };

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-700">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-gradient-to-r from-purple-500 to-purple-700 rounded-full flex items-center justify-center">
            <Bot className="w-6 h-6 text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-white">AI Assistant</h3>
            <div className="flex items-center space-x-2">
              <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400' : 'bg-yellow-400'}`}></div>
              <span className="text-xs text-gray-400">
                {isConnected ? 'Connected to MCP Server' : 'Fallback Mode'}
              </span>
              {locationPermission === 'granted' && userLocation && (
                <div className="flex items-center space-x-1">
                  <div className="w-2 h-2 rounded-full bg-blue-400"></div>
                  <span className="text-xs text-blue-400">Location enabled</span>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          {locationPermission === 'denied' || locationPermission === 'prompt' ? (
            <button
              onClick={requestLocation}
              className="flex items-center space-x-1 text-blue-400 text-xs hover:text-blue-300 transition-colors"
              title="Enable location to find nearest charging stations"
            >
              <span>📍</span>
              <span>Enable Location</span>
            </button>
          ) : userLocation && (
            <button
              onClick={refreshLocation}
              className="flex items-center space-x-1 text-blue-400 text-xs hover:text-blue-300 transition-colors"
              title="Refresh location"
            >
              <span>📍</span>
              <span>Refresh</span>
            </button>
          )}
          {!isConnected && (
            <div className="flex items-center space-x-1 text-yellow-400 text-xs">
              <AlertCircle className="w-4 h-4" />
              <span>Limited functionality</span>
            </div>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div className={`max-w-[80%] ${message.role === 'user' ? 'order-2' : 'order-1'}`}>
              {message.role === 'assistant' && (
                <div className="flex items-center space-x-2 mb-2">
                  <Bot className="w-5 h-5 text-purple-400" />
                  <span className="text-sm text-gray-400">SEI Solar AI</span>
                  {message.fallback && (
                    <div className="flex items-center space-x-1 text-yellow-400">
                      <AlertCircle className="w-3 h-3" />
                      <span className="text-xs">Fallback</span>
                    </div>
                  )}
                  {message.tool_calls && message.tool_calls.length > 0 && (
                    <div className="flex items-center space-x-1 text-green-400">
                      <CheckCircle className="w-3 h-3" />
                      <span className="text-xs">Tools used</span>
                    </div>
                  )}
                </div>
              )}
              
              <div
                className={`p-4 rounded-2xl ${
                  message.role === 'user'
                    ? 'bg-gradient-to-r from-green-500 to-emerald-600 text-white'
                    : message.error
                    ? 'bg-red-500/20 border border-red-500/30 text-red-200'
                    : 'bg-gray-800 text-gray-100'
                }`}
              >
                <div 
                  dangerouslySetInnerHTML={{ 
                    __html: formatMessage(message.content) 
                  }}
                />
                
                {message.role === 'user' && (
                  <div className="flex items-center justify-end space-x-1 mt-2 opacity-70">
                    <User className="w-3 h-3" />
                    <span className="text-xs">You</span>
                  </div>
                )}
                
                {/* Tool calls display */}
                {message.tool_calls && message.tool_calls.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-gray-700">
                    <div className="text-xs text-gray-400 mb-2">
                      Used {message.tool_calls.length} tool{message.tool_calls.length > 1 ? 's' : ''}:
                    </div>
                    <div className="space-y-1">
                      {message.tool_calls.map((tool, index) => (
                        <div key={index} className="bg-gray-900 rounded p-2 text-xs">
                          <span className="text-blue-400 font-medium">{tool.tool}</span>
                          {tool.result && (
                            <div className="text-gray-500 mt-1">✓ Executed successfully</div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              
              <div className="text-xs text-gray-500 mt-1 px-2">
                {new Date(message.timestamp).toLocaleTimeString()}
              </div>
            </div>
          </div>
        ))}
        
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-800 rounded-2xl p-4 flex items-center space-x-2">
              <Loader2 className="w-4 h-4 text-purple-400 animate-spin" />
              <span className="text-gray-400">AI is thinking...</span>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-gray-700">
        <div className="flex space-x-3">
          <div className="flex-1 relative">
            <textarea
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder={address ? "Ask me anything about SEI Solar..." : "Connect wallet for personalized help..."}
              className="w-full p-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-400 focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
              rows={1}
              disabled={isLoading}
              style={{ minHeight: '44px', maxHeight: '120px' }}
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement;
                target.style.height = 'auto';
                target.style.height = Math.min(target.scrollHeight, 120) + 'px';
              }}
            />
          </div>
          <button
            onClick={sendMessage}
            disabled={!inputMessage.trim() || isLoading}
            className="px-4 py-2 bg-gradient-to-r from-purple-500 to-purple-700 text-white rounded-lg hover:from-purple-600 hover:to-purple-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </button>
        </div>
        <div className="text-xs text-gray-500 mt-2 text-center">
          AI responses may take a few seconds. Press Enter to send, Shift+Enter for new line.
        </div>
      </div>
    </div>
  );
}