'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useWallet } from '@/contexts/WalletContext';
import { 
  TrendingUp, 
  Battery, 
  ArrowRight, 
  Zap, 
  MapPin,
  Wallet,
  Users,
  BarChart3
} from 'lucide-react';

export default function Dashboard() {
  const router = useRouter();
  const { address, isConnected } = useWallet();
  const [selectedRole, setSelectedRole] = useState<'owner' | 'consumer' | null>(null);

  // Don't auto-redirect - let users manually navigate
  if (!isConnected) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white mb-4">Wallet Not Connected</h1>
          <p className="text-gray-400 mb-6">Please connect your wallet to access the dashboard</p>
          <button
            onClick={() => router.push('/')}
            className="px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white font-medium rounded-lg hover:from-green-600 hover:to-emerald-700 transition-colors"
          >
            Go to Home
          </button>
        </div>
      </div>
    );
  }

  const handleRoleSelection = (role: 'owner' | 'consumer') => {
    setSelectedRole(role);
    // Add a small delay for smooth transition
    setTimeout(() => {
      router.push(`/dashboard/${role}`);
    }, 300);
  };

  const roles = [
    {
      id: 'owner' as const,
      title: 'Station Owner',
      description: 'Register and manage your solar charging stations, monitor earnings, and grow your network.',
      icon: <TrendingUp className="w-12 h-12" />,
      features: [
        'Register charging stations on interactive maps',
        'Set pricing and manage station availability',
        'View real-time earnings and analytics',
        'Withdraw earnings to your wallet',
        'Monitor station performance metrics'
      ],
      gradient: 'from-blue-500 to-blue-700',
      bgGradient: 'from-blue-500/10 to-blue-700/10'
    },
    {
      id: 'consumer' as const,
      title: 'EV Driver',
      description: 'Discover charging stations, book sessions, manage your SEI wallet, and get AI assistance.',
      icon: <Battery className="w-12 h-12" />,
      features: [
        'Discover nearby charging stations',
        'Book and manage charging sessions',
        'Deposit and withdraw SEI tokens',
        'Get help from AI assistant',
        'Track charging history and expenses'
      ],
      gradient: 'from-green-500 to-emerald-700',
      bgGradient: 'from-green-500/10 to-emerald-700/10'
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black">
      {/* Header */}
      <div className="px-6 py-8">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center space-x-3">
            <div className="gradient-animation w-10 h-10 rounded-lg flex items-center justify-center">
              <Zap className="w-6 h-6 text-white" />
            </div>
            <div>
              <span className="text-2xl font-bold text-white">SEI Solar Dashboard</span>
              <div className="text-sm text-gray-400">
                Connected: {address?.slice(0, 6)}...{address?.slice(-4)}
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <div className="px-4 py-2 bg-green-500/20 rounded-full text-green-400 text-sm font-medium">
              Wallet Connected
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="px-6 py-12">
        <div className="max-w-6xl mx-auto">
          {/* Welcome Section */}
          <div className="text-center mb-16">
            <h1 className="text-5xl font-bold text-white mb-6">
              Welcome to SEI Solar
            </h1>
            <p className="text-xl text-gray-300 max-w-3xl mx-auto">
              Choose your role to access personalized features and start your journey 
              in the decentralized solar charging ecosystem.
            </p>
          </div>

          {/* Role Selection Cards */}
          <div className="grid md:grid-cols-2 gap-8 mb-16">
            {roles.map((role) => (
              <div
                key={role.id}
                className={`relative glass rounded-2xl p-8 cursor-pointer transform transition-all duration-300 hover:-translate-y-2 hover:shadow-2xl ${
                  selectedRole === role.id 
                    ? 'ring-2 ring-white/30 bg-white/10' 
                    : 'hover:bg-white/10'
                }`}
                onClick={() => handleRoleSelection(role.id)}
              >
                {/* Background Gradient */}
                <div className={`absolute inset-0 bg-gradient-to-br ${role.bgGradient} rounded-2xl opacity-50`}></div>
                
                {/* Content */}
                <div className="relative z-10">
                  <div className={`inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-r ${role.gradient} mb-6`}>
                    <div className="text-white">
                      {role.icon}
                    </div>
                  </div>
                  
                  <h3 className="text-2xl font-bold text-white mb-4">
                    {role.title}
                  </h3>
                  
                  <p className="text-gray-300 mb-6 leading-relaxed">
                    {role.description}
                  </p>
                  
                  <ul className="space-y-3 mb-8">
                    {role.features.map((feature, index) => (
                      <li key={index} className="flex items-start text-gray-300">
                        <div className="w-2 h-2 bg-green-400 rounded-full mt-2 mr-3 flex-shrink-0"></div>
                        <span className="text-sm">{feature}</span>
                      </li>
                    ))}
                  </ul>
                  
                  <button
                    className={`w-full flex items-center justify-center space-x-3 px-6 py-4 bg-gradient-to-r ${role.gradient} text-white font-semibold rounded-xl hover:shadow-lg transform hover:scale-105 transition-all duration-200`}
                    disabled={selectedRole === role.id}
                  >
                    {selectedRole === role.id ? (
                      <>
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        <span>Loading Dashboard...</span>
                      </>
                    ) : (
                      <>
                        <span>Enter {role.title} Dashboard</span>
                        <ArrowRight className="w-5 h-5" />
                      </>
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Quick Stats Preview */}
          <div className="glass rounded-2xl p-8 text-center">
            <h3 className="text-2xl font-bold text-white mb-6">Platform Overview</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div className="space-y-2">
                <div className="flex justify-center text-blue-400">
                  <MapPin className="w-8 h-8" />
                </div>
                <div className="text-2xl font-bold text-white">500+</div>
                <div className="text-gray-400 text-sm">Active Stations</div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-center text-green-400">
                  <Users className="w-8 h-8" />
                </div>
                <div className="text-2xl font-bold text-white">10,000+</div>
                <div className="text-gray-400 text-sm">Users</div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-center text-yellow-400">
                  <Zap className="w-8 h-8" />
                </div>
                <div className="text-2xl font-bold text-white">1M+</div>
                <div className="text-gray-400 text-sm">kWh Delivered</div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-center text-purple-400">
                  <BarChart3 className="w-8 h-8" />
                </div>
                <div className="text-2xl font-bold text-white">$2.5M+</div>
                <div className="text-gray-400 text-sm">Total Volume</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}