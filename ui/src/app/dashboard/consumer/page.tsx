'use client';

import { useState, useEffect } from 'react';
import { useWallet } from '@/contexts/WalletContext';
import { useRouter } from 'next/navigation';
import { getContract } from '@/lib/contracts';
import { formatSEIAmount, parseSEIAmount, convertMicrodegreesToDecimal } from '@/lib/utils';
import AdvancedChatInterface from '@/components/AdvancedChatInterface';
import {
  ArrowLeft,
  Battery,
  Wallet,
  MapPin,
  Bot,
  Plus,
  Minus,
  Zap,
  Clock,
  DollarSign,
  Search,
  Filter,
  MessageCircle
} from 'lucide-react';

interface Station {
  id: number;
  uniqueId: string;
  url: string;
  pricePerWatt: bigint;
  power: bigint;
  owner: string;
  physicalAddress: string;
  latitude: number;
  longitude: number;
  distance?: number;
}

interface WalletBalance {
  balance: string;
  deposited: string;
}

interface Booking {
  id: number;
  stationId: number;
  watt: number;
  power: number;
  pricePaid: string;
  timestamp: number;
  status: 'ACTIVE' | 'COMPLETED' | 'STOPPED';
  wattsConsumed: number;
  refundAmount: string;
}

export default function ConsumerDashboard() {
  const router = useRouter();
  const { address, signer, isConnected, isInitialized, disconnectWallet } = useWallet();
  const [activeTab, setActiveTab] = useState<'stations' | 'wallet' | 'bookings' | 'chat'>('stations');
  const [stations, setStations] = useState<Station[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [walletBalance, setWalletBalance] = useState<WalletBalance>({ balance: '0.0000', deposited: '0.0000' });
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingBookings, setIsLoadingBookings] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [depositAmount, setDepositAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [isDepositing, setIsDepositing] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [showChatbot, setShowChatbot] = useState(false);

  useEffect(() => {
    // Only redirect after wallet context is initialized
    if (isInitialized && !isConnected && !address) {
      router.push('/');
      return;
    }
    if (isInitialized && isConnected && address) {
      loadConsumerData();
    }
  }, [isInitialized, isConnected, address]);

  const loadConsumerData = async () => {
    if (!signer || !address) return;

    try {
      setIsLoading(true);
      
      // Load stations
      const stationContract = await getContract('ChargingStation', signer);
      const allStationsData = await stationContract.getAllStations();
      const [ids, uniqueIds, urls, prices, powers, owners, addresses, latitudes, longitudes] = allStationsData;
      
      const stationsList: Station[] = [];
      for (let i = 0; i < ids.length; i++) {
        stationsList.push({
          id: Number(ids[i]),
          uniqueId: uniqueIds[i],
          url: urls[i],
          pricePerWatt: prices[i],
          power: powers[i],
          owner: owners[i],
          physicalAddress: addresses[i],
          latitude: convertMicrodegreesToDecimal(latitudes[i]),
          longitude: convertMicrodegreesToDecimal(longitudes[i]),
          distance: Math.random() * 10 + 0.5 // Mock distance for demo
        });
      }
      
      setStations(stationsList.sort((a, b) => (a.distance || 0) - (b.distance || 0)));
      
      // Load wallet balance
      const userWalletContract = await getContract('UserWallet', signer);
      try {
        const balance = await userWalletContract.getUserBalance(address);
        setWalletBalance({
          balance: formatSEIAmount(balance),
          deposited: formatSEIAmount(balance)
        });
      } catch (error) {
        console.error('Error loading wallet balance:', error);
      }
    } catch (error) {
      console.error('Error loading consumer data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadUserBookings = async () => {
    if (!signer || !address) return;

    try {
      setIsLoadingBookings(true);
      const bookingContract = await getContract('ChargingBooking', signer);
      
      // Get user's booking IDs
      const bookingIds = await bookingContract.getUserBookings(address);
      console.log(address)
      
      if (bookingIds.length === 0) {
        setBookings([]);
        return;
      }
      
      // Get details for each booking
      const bookingDetails: Booking[] = [];
      for (const bookingId of bookingIds) {
        try {
          const booking = await bookingContract.getBooking(Number(bookingId));
          const [user, stationId, watt, power, pricePaid, timestamp, status, wattsConsumed, refundAmount] = booking;
          
          bookingDetails.push({
            id: Number(bookingId),
            stationId: Number(stationId),
            watt: Number(watt),
            power: Number(power),
            pricePaid: formatSEIAmount(pricePaid),
            timestamp: Number(timestamp),
            status: status === 0 ? 'ACTIVE' : status === 1 ? 'COMPLETED' : 'STOPPED',
            wattsConsumed: Number(wattsConsumed),
            refundAmount: formatSEIAmount(refundAmount)
          });
        } catch (error) {
          console.error(`Error loading booking ${bookingId}:`, error);
        }
      }
      
      // Sort by timestamp (newest first)
      bookingDetails.sort((a, b) => b.timestamp - a.timestamp);
      setBookings(bookingDetails);
    } catch (error) {
      console.error('Error loading user bookings:', error);
      setBookings([]);
    } finally {
      setIsLoadingBookings(false);
    }
  };

  const handleDisconnect = () => {
    disconnectWallet();
    router.push('/');
  };

  const handleDeposit = async () => {
    if (!signer || !depositAmount) return;

    try {
      setIsDepositing(true);
      const userWalletContract = await getContract('UserWallet', signer);
      const amount = parseSEIAmount(depositAmount);
      
      const tx = await userWalletContract.deposit({ value: amount });
      await tx.wait();
      
      setDepositAmount('');
      await loadConsumerData();
    } catch (error) {
      console.error('Error depositing:', error);
      alert('Failed to deposit. Please try again.');
    } finally {
      setIsDepositing(false);
    }
  };

  const handleWithdraw = async () => {
    if (!signer || !withdrawAmount) return;

    try {
      setIsWithdrawing(true);
      const userWalletContract = await getContract('UserWallet', signer);
      const amount = parseSEIAmount(withdrawAmount);
      
      const tx = await userWalletContract.withdraw(amount);
      await tx.wait();
      
      setWithdrawAmount('');
      await loadConsumerData();
    } catch (error) {
      console.error('Error withdrawing:', error);
      alert('Failed to withdraw. Please try again.');
    } finally {
      setIsWithdrawing(false);
    }
  };

  const openStationOnMap = (station: Station) => {
    const googleMapsUrl = `https://maps.google.com/maps?q=${station.latitude},${station.longitude}`;
    window.open(googleMapsUrl, '_blank');
  };

  const getStationName = (stationId: number) => {
    const station = stations.find(s => s.id === stationId);
    return station ? station.uniqueId : `Station ${stationId}`;
  };

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE': return 'text-green-400 bg-green-400/20';
      case 'COMPLETED': return 'text-blue-400 bg-blue-400/20';
      case 'STOPPED': return 'text-red-400 bg-red-400/20';
      default: return 'text-gray-400 bg-gray-400/20';
    }
  };

  // Load bookings when bookings tab is activated
  useEffect(() => {
    if (activeTab === 'bookings' && isConnected && address) {
      loadUserBookings();
    }
  }, [activeTab, isConnected, address]);

  const filteredStations = stations.filter(station =>
    station.uniqueId.toLowerCase().includes(searchTerm.toLowerCase()) ||
    station.physicalAddress.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!isConnected) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black">
      {/* Header */}
      <div className="px-6 py-8">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => router.push('/dashboard')}
              className="p-2 text-gray-400 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-6 h-6" />
            </button>
            <div className="flex items-center space-x-3">
              <div className="bg-gradient-to-r from-green-500 to-emerald-700 w-10 h-10 rounded-lg flex items-center justify-center">
                <Battery className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">EV Driver Dashboard</h1>
                <div className="text-sm text-gray-400">
                  {address?.slice(0, 6)}...{address?.slice(-4)}
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={() => setShowChatbot(!showChatbot)}
              className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-purple-700 text-white font-medium rounded-lg hover:from-purple-600 hover:to-purple-800 transition-colors"
            >
              <Bot className="w-5 h-5" />
              <span>AI Assistant</span>
            </button>
            <button
              onClick={handleDisconnect}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white font-medium rounded-lg transition-colors"
            >
              Disconnect
            </button>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="px-6 mb-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex space-x-1 bg-gray-800/50 rounded-lg p-1">
            {[
              { id: 'stations', label: 'Find Stations', icon: <MapPin className="w-4 h-4" /> },
              { id: 'wallet', label: 'Wallet', icon: <Wallet className="w-4 h-4" /> },
              { id: 'bookings', label: 'My Bookings', icon: <Clock className="w-4 h-4" /> },
              { id: 'chat', label: 'AI Chat', icon: <MessageCircle className="w-4 h-4" /> }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center space-x-2 px-4 py-3 rounded-lg font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'bg-green-500 text-white'
                    : 'text-gray-400 hover:text-white hover:bg-gray-700'
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="px-6">
        <div className="max-w-7xl mx-auto">
          {/* Stations Tab */}
          {activeTab === 'stations' && (
            <div className="space-y-6">
              {/* Search and Filter */}
              <div className="glass rounded-xl p-6">
                <div className="flex flex-col md:flex-row gap-4">
                  <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                    <input
                      type="text"
                      placeholder="Search stations..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-12 pr-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    />
                  </div>
                  <button className="flex items-center space-x-2 px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors">
                    <Filter className="w-5 h-5" />
                    <span>Filter</span>
                  </button>
                </div>
              </div>

              {/* Stations Grid */}
              <div className="glass rounded-xl p-6">
                <h2 className="text-xl font-bold text-white mb-6">Nearby Charging Stations</h2>
                
                {isLoading ? (
                  <div className="flex justify-center py-12">
                    <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredStations.map((station) => (
                      <div key={station.id} className="bg-white/5 rounded-xl p-6 hover:bg-white/10 transition-colors">
                        <div className="flex items-start justify-between mb-4">
                          <div>
                            <h3 className="font-semibold text-white mb-1">{station.uniqueId}</h3>
                            <div className="text-gray-400 text-sm">{station.physicalAddress}</div>
                          </div>
                          <div className="text-green-400 text-sm font-medium">
                            {/* {station.distance?.toFixed(1)} km */}
                          </div>
                        </div>
                        
                        <div className="space-y-2 text-sm mb-4">
                          <div className="flex justify-between">
                            <span className="text-gray-400">Power:</span>
                            <span className="text-white">{Number(station.power) / 1000} kW</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-400">Price:</span>
                            <span className="text-white">{formatSEIAmount(station.pricePerWatt)} SEI/Wh</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-400">Status:</span>
                            <span className="text-green-400">Available</span>
                          </div>
                        </div>
                        
                        <div className="flex justify-center">
                          <button
                            onClick={() => openStationOnMap(station)}
                            className="flex items-center space-x-2 px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white font-medium rounded-lg hover:from-blue-600 hover:to-blue-700 transition-colors"
                          >
                            <MapPin className="w-4 h-4" />
                            <span>Open Location</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Wallet Tab */}
          {activeTab === 'wallet' && (
            <div className="space-y-6">
              {/* Balance Overview */}
              <div className="grid md:grid-cols-2 gap-6">
                <div className="glass rounded-xl p-6">
                  <div className="flex items-center space-x-3 mb-4">
                    <Wallet className="w-8 h-8 text-green-400" />
                    <div>
                      <h3 className="text-lg font-semibold text-white">Wallet Balance</h3>
                      <div className="text-gray-400 text-sm">Available for charging</div>
                    </div>
                  </div>
                  <div className="text-3xl font-bold text-white mb-2">{walletBalance.deposited} SEI</div>
                  <div className="text-gray-400 text-sm">≈ ${(parseFloat(walletBalance.deposited) * 0.5).toFixed(2)} USD</div>
                </div>
                
                <div className="glass rounded-xl p-6">
                  <div className="flex items-center space-x-3 mb-4">
                    <DollarSign className="w-8 h-8 text-blue-400" />
                    <div>
                      <h3 className="text-lg font-semibold text-white">Total Spent</h3>
                      <div className="text-gray-400 text-sm">This month</div>
                    </div>
                  </div>
                  <div className="text-3xl font-bold text-white mb-2">0.0000 SEI</div>
                  <div className="text-gray-400 text-sm">≈ $0.00 USD</div>
                </div>
              </div>

              {/* Deposit/Withdraw */}
              <div className="grid md:grid-cols-2 gap-6">
                {/* Deposit */}
                <div className="glass rounded-xl p-6">
                  <h3 className="text-lg font-semibold text-white mb-4">Deposit SEI</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-gray-400 text-sm mb-2">Amount (SEI)</label>
                      <div className="relative">
                        <input
                          type="number"
                          step="0.0001"
                          placeholder="0.0000"
                          value={depositAmount}
                          onChange={(e) => setDepositAmount(e.target.value)}
                          className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-green-500 focus:border-transparent"
                        />
                        <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 text-sm">
                          SEI
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={handleDeposit}
                      disabled={isDepositing || !depositAmount}
                      className="w-full px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white font-medium rounded-lg hover:from-green-600 hover:to-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isDepositing ? (
                        <div className="flex items-center justify-center space-x-2">
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          <span>Depositing...</span>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center space-x-2">
                          <Plus className="w-4 h-4" />
                          <span>Deposit</span>
                        </div>
                      )}
                    </button>
                  </div>
                </div>

                {/* Withdraw */}
                <div className="glass rounded-xl p-6">
                  <h3 className="text-lg font-semibold text-white mb-4">Withdraw SEI</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-gray-400 text-sm mb-2">Amount (SEI)</label>
                      <div className="relative">
                        <input
                          type="number"
                          step="0.0001"
                          placeholder="0.0000"
                          value={withdrawAmount}
                          onChange={(e) => setWithdrawAmount(e.target.value)}
                          className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                        <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 text-sm">
                          SEI
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={handleWithdraw}
                      disabled={isWithdrawing || !withdrawAmount}
                      className="w-full px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white font-medium rounded-lg hover:from-blue-600 hover:to-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isWithdrawing ? (
                        <div className="flex items-center justify-center space-x-2">
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          <span>Withdrawing...</span>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center space-x-2">
                          <Minus className="w-4 h-4" />
                          <span>Withdraw</span>
                        </div>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Bookings Tab */}
          {activeTab === 'bookings' && (
            <div className="glass rounded-xl p-6">
              <h2 className="text-xl font-bold text-white mb-6">My Charging Sessions</h2>
              
              {isLoadingBookings ? (
                <div className="flex justify-center py-12">
                  <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                </div>
              ) : bookings.length === 0 ? (
                <div className="text-center py-12">
                  <Clock className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-white mb-2">No bookings yet</h3>
                  <p className="text-gray-400 mb-4">Your charging sessions will appear here</p>
                  <button
                    onClick={() => setActiveTab('stations')}
                    className="px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white font-medium rounded-lg hover:from-green-600 hover:to-emerald-700 transition-colors"
                  >
                    Find Stations
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {bookings.map((booking) => (
                    <div key={booking.id} className="bg-white/5 rounded-xl p-6 hover:bg-white/10 transition-colors">
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <h3 className="font-semibold text-white mb-1">
                            {getStationName(booking.stationId)}
                          </h3>
                          <div className="text-gray-400 text-sm">
                            {formatTimestamp(booking.timestamp)}
                          </div>
                        </div>
                        <div className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(booking.status)}`}>
                          {booking.status}
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <span className="text-gray-400 block">Power Requested</span>
                          <span className="text-white font-medium">{(booking.power / 1000)} kW</span>
                        </div>
                        <div>
                          <span className="text-gray-400 block">Energy Requested</span>
                          <span className="text-white font-medium">{booking.watt} Wh</span>
                        </div>
                        <div>
                          <span className="text-gray-400 block">Amount Paid</span>
                          <span className="text-white font-medium">{booking.pricePaid} SEI</span>
                        </div>
                        <div>
                          <span className="text-gray-400 block">Booking ID</span>
                          <span className="text-white font-medium">#{booking.id}</span>
                        </div>
                      </div>
                      
                      {booking.status === 'STOPPED' && (
                        <div className="mt-4 pt-4 border-t border-gray-700">
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <span className="text-gray-400 block">Energy Consumed</span>
                              <span className="text-white font-medium">{booking.wattsConsumed} Wh</span>
                            </div>
                            <div>
                              <span className="text-gray-400 block">Refund Amount</span>
                              <span className="text-green-400 font-medium">{booking.refundAmount} SEI</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Chat Tab */}
          {activeTab === 'chat' && (
            <div className="h-[600px]">
              <AdvancedChatInterface
                context={{
                  page: 'consumer-dashboard',
                  additional_context: {
                    wallet_balance: walletBalance.deposited,
                    available_stations: stations.length,
                    user_role: 'consumer'
                  }
                }}
                className="h-full"
              />
            </div>
          )}
        </div>
      </div>

      {/* Floating Chatbot Button */}
      {showChatbot && activeTab !== 'chat' && (
        <div className="fixed bottom-6 right-6 z-50">
          <div className="glass rounded-2xl p-4 w-80 max-w-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-2">
                <Bot className="w-6 h-6 text-purple-400" />
                <span className="font-medium text-white">AI Assistant</span>
              </div>
              <button
                onClick={() => setShowChatbot(false)}
                className="text-gray-400 hover:text-white transition-colors"
              >
                ×
              </button>
            </div>
            <div className="text-center py-8">
              <p className="text-gray-400 text-sm">Mini chatbot interface</p>
              <button
                onClick={() => setActiveTab('chat')}
                className="mt-4 px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg transition-colors"
              >
                Open Full Chat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}