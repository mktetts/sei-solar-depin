'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useWallet } from '@/contexts/WalletContext';
import { 
  Zap, 
  MapPin, 
  Wallet, 
  Bot, 
  Shield, 
  Leaf, 
  ArrowRight, 
  CheckCircle,
  TrendingUp,
  Users,
  Globe,
  Battery
} from 'lucide-react';

export default function LandingPage() {
  const router = useRouter();
  const { isConnected, isConnecting, connectWallet, disconnectWallet, address } = useWallet();
  const [isLoading, setIsLoading] = useState(false);

  const handleContinue = async () => {
    if (!isConnected) {
      setIsLoading(true);
      await connectWallet();
      setIsLoading(false);
    } else {
      router.push('/dashboard');
    }
  };

  // Remove auto-redirect - users must manually navigate to dashboard

  const features = [
    {
      icon: <Zap className="w-8 h-8" />,
      title: "Smart Charging Network",
      description: "Connect to a decentralized network of solar-powered EV charging stations across the globe."
    },
    {
      icon: <MapPin className="w-8 h-8" />,
      title: "Interactive Station Discovery",
      description: "Find nearby charging stations using our interactive map with real-time availability."
    },
    {
      icon: <Wallet className="w-8 h-8" />,
      title: "SEI Token Integration",
      description: "Pay for charging sessions and earn rewards using SEI tokens on the blockchain."
    },
    {
      icon: <Bot className="w-8 h-8" />,
      title: "AI Assistant",
      description: "Get personalized recommendations and support from our intelligent chatbot."
    },
    {
      icon: <Shield className="w-8 h-8" />,
      title: "Secure & Transparent",
      description: "All transactions are secured by blockchain technology with full transparency."
    },
    {
      icon: <Leaf className="w-8 h-8" />,
      title: "Sustainable Energy",
      description: "Power your EV with 100% renewable solar energy for a greener future."
    }
  ];

  const stats = [
    { icon: <Users className="w-6 h-6" />, value: "10,000+", label: "Active Users" },
    { icon: <MapPin className="w-6 h-6" />, value: "500+", label: "Charging Stations" },
    { icon: <Zap className="w-6 h-6" />, value: "1M+", label: "kWh Delivered" },
    { icon: <Globe className="w-6 h-6" />, value: "25+", label: "Countries" }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        {/* Background Pattern */}
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiMxMGI5ODEiIGZpbGwtb3BhY2l0eT0iMC4xIj48Y2lyY2xlIGN4PSIzMCIgY3k9IjMwIiByPSI0Ii8+PC9nPjwvZz48L3N2Zz4=')] opacity-20"></div>
        
        {/* Navigation */}
        <nav className="relative z-10 px-6 py-8">
          <div className="flex items-center justify-between max-w-7xl mx-auto">
            <div className="flex items-center space-x-3">
              <div className="gradient-animation w-10 h-10 rounded-lg flex items-center justify-center">
                <Zap className="w-6 h-6 text-white" />
              </div>
              <span className="text-2xl font-bold text-white">SEI Solar</span>
            </div>
            <div className="flex items-center space-x-4">
              {isConnected ? (
                <div className="flex items-center space-x-3">
                  <div className="px-4 py-2 bg-green-500/20 rounded-full text-green-400 text-sm font-medium">
                    Connected: {address?.slice(0, 6)}...{address?.slice(-4)}
                  </div>
                  <button
                    onClick={disconnectWallet}
                    className="px-4 py-2 bg-red-500/20 text-red-400 text-sm font-medium rounded-full hover:bg-red-500/30 transition-colors"
                  >
                    Disconnect
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </nav>

        {/* Hero Content */}
        <div className="relative z-10 px-6 py-20">
          <div className="max-w-7xl mx-auto text-center">
            <div className="mb-8">
              <h1 className="text-6xl md:text-8xl font-bold text-white mb-6 leading-tight">
                Power Your
                <span className=" text-green-400"> Future</span>
              </h1>
              <p className="text-xl md:text-2xl text-gray-300 max-w-3xl mx-auto leading-relaxed">
                Join the decentralized revolution of sustainable EV charging. 
                Earn SEI tokens while powering your journey with clean, solar energy.
              </p>
            </div>

            {/* CTA Button */}
            <div className="mb-16">
              <button
                onClick={handleContinue}
                disabled={isConnecting || isLoading}
                className="group relative px-12 py-4 text-lg font-semibold text-white bg-gradient-to-r from-green-500 to-emerald-600 rounded-full hover:from-green-600 hover:to-emerald-700 transform hover:scale-105 transition-all duration-300 shadow-2xl shadow-green-500/25 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isConnecting || isLoading ? (
                  <div className="flex items-center space-x-3">
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>Connecting...</span>
                  </div>
                ) : isConnected ? (
                  <div className="flex items-center space-x-3">
                    <CheckCircle className="w-5 h-5" />
                    <span>Enter Dashboard</span>
                    <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </div>
                ) : (
                  <div className="flex items-center space-x-3">
                    <Wallet className="w-5 h-5" />
                    <span>Connect Wallet & Continue</span>
                    <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </div>
                )}
              </button>
              {!isConnected && (
                <p className="text-gray-400 text-sm mt-4">
                  MetaMask required to access the platform
                </p>
              )}
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 max-w-4xl mx-auto">
              {stats.map((stat, index) => (
                <div key={index} className="glass rounded-xl p-6 text-center hover:bg-white/10 transition-colors">
                  <div className="flex justify-center mb-3 text-green-400">
                    {stat.icon}
                  </div>
                  <div className="text-2xl font-bold text-white mb-1">{stat.value}</div>
                  <div className="text-gray-400 text-sm">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Features Section */}
      <section className="py-20 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
              Revolutionizing EV Charging
            </h2>
            <p className="text-xl text-gray-300 max-w-3xl mx-auto">
              Experience the future of electric vehicle charging with our comprehensive 
              blockchain-powered ecosystem designed for sustainability and efficiency.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <div 
                key={index}
                className="glass rounded-xl p-8 hover:bg-white/10 transition-all duration-300 transform hover:-translate-y-2 hover:shadow-2xl"
              >
                <div className="text-green-400 mb-4">
                  {feature.icon}
                </div>
                <h3 className="text-xl font-semibold text-white mb-3">
                  {feature.title}
                </h3>
                <p className="text-gray-300 leading-relaxed">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Role-based Features Preview */}
      <section className="py-20 px-6 bg-gradient-to-r from-gray-800/50 to-gray-900/50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
              Choose Your Path
            </h2>
            <p className="text-xl text-gray-300">
              Whether you're charging or sharing power, we've got you covered
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-12">
            {/* Station Owner */}
            <div className="glass rounded-2xl p-8 text-center">
              <div className="gradient-animation w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
                <TrendingUp className="w-10 h-10 text-white" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-4">Station Owner</h3>
              <p className="text-gray-300 mb-6">
                Register your solar charging stations, set prices, and earn SEI tokens from every charging session.
              </p>
              <ul className="text-left text-gray-300 space-y-2">
                <li className="flex items-center">
                  <CheckCircle className="w-5 h-5 text-green-400 mr-3" />
                  Interactive station registration with maps
                </li>
                <li className="flex items-center">
                  <CheckCircle className="w-5 h-5 text-green-400 mr-3" />
                  Real-time earnings dashboard
                </li>
                <li className="flex items-center">
                  <CheckCircle className="w-5 h-5 text-green-400 mr-3" />
                  Withdraw earnings anytime
                </li>
                <li className="flex items-center">
                  <CheckCircle className="w-5 h-5 text-green-400 mr-3" />
                  Station management tools
                </li>
              </ul>
            </div>

            {/* Consumer */}
            <div className="glass rounded-2xl p-8 text-center">
              <div className="gradient-animation w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
                <Battery className="w-10 h-10 text-white" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-4">EV Driver</h3>
              <p className="text-gray-300 mb-6">
                Discover stations, book charging sessions, and manage your SEI wallet with AI assistance.
              </p>
              <ul className="text-left text-gray-300 space-y-2">
                <li className="flex items-center">
                  <CheckCircle className="w-5 h-5 text-green-400 mr-3" />
                  Interactive station discovery maps
                </li>
                <li className="flex items-center">
                  <CheckCircle className="w-5 h-5 text-green-400 mr-3" />
                  Seamless booking system
                </li>
                <li className="flex items-center">
                  <CheckCircle className="w-5 h-5 text-green-400 mr-3" />
                  AI-powered assistance
                </li>
                <li className="flex items-center">
                  <CheckCircle className="w-5 h-5 text-green-400 mr-3" />
                  Wallet management tools
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-6 border-t border-gray-800">
        <div className="max-w-7xl mx-auto text-center">
          <div className="flex items-center justify-center space-x-3 mb-6">
            <div className="gradient-animation w-8 h-8 rounded-lg flex items-center justify-center">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold text-white">SEI Solar</span>
          </div>
          <p className="text-gray-400">
            Powering the future of sustainable transportation with blockchain technology
          </p>
          <p className="text-gray-500 text-sm mt-4">
            Built with ❤️ for a sustainable future
          </p>
        </div>
      </footer>
    </div>
  );
}
