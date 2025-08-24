'use client';

import { useState, useEffect } from 'react';
import { useWallet } from '@/contexts/WalletContext';
import { useRouter } from 'next/navigation';
import { getContract } from '@/lib/contracts';
import { formatSEIAmount, convertMicrodegreesToDecimal, convertDecimalToMicrodegrees } from '@/lib/utils';
import MapboxMap from '@/components/MapboxMap';
import {
  Plus,
  MapPin,
  Zap,
  DollarSign,
  TrendingUp,
  Settings,
  ArrowLeft,
  Wallet,
  BarChart3,
  Map,
  X,
  Download
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
}

interface StationFormData {
  uniqueId: string;
  url: string;
  pricePerWatt: string;
  power: string;
  physicalAddress: string;
  latitude: number;
  longitude: number;
}

export default function OwnerDashboard() {
  const router = useRouter();
  const { address, signer, isConnected, isInitialized, disconnectWallet } = useWallet();
  const [stations, setStations] = useState<Station[]>([]);
  const [totalEarnings, setTotalEarnings] = useState<string>('0.0000');
  const [availableWithdraw, setAvailableWithdraw] = useState<string>('0.0000');
  const [isLoading, setIsLoading] = useState(true);
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [editingStation, setEditingStation] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ power: '', pricePerWatt: '' });
  const [isUpdating, setIsUpdating] = useState(false);

  const [formData, setFormData] = useState<StationFormData>({
    uniqueId: '',
    url: '',
    pricePerWatt: '',
    power: '',
    physicalAddress: '',
    latitude: 0,
    longitude: 0
  });

  useEffect(() => {
    // Only redirect after wallet context is initialized
    if (isInitialized && !isConnected && !address) {
      router.push('/');
      return;
    }
    if (isInitialized && isConnected && address) {
      loadOwnerData();
    }
  }, [isInitialized, isConnected, address]);

  const loadOwnerData = async () => {
    if (!signer || !address) return;

    try {
      setIsLoading(true);
      const stationContract = await getContract('ChargingStation', signer);
      
      // Get all stations
      const allStationsData = await stationContract.getAllStations();
      const [ids, uniqueIds, urls, prices, powers, owners, addresses, latitudes, longitudes] = allStationsData;
      
      // Filter stations owned by current user
      const ownerStations: Station[] = [];
      for (let i = 0; i < ids.length; i++) {
        if (owners[i].toLowerCase() === address.toLowerCase()) {
          ownerStations.push({
            id: Number(ids[i]),
            uniqueId: uniqueIds[i],
            url: urls[i],
            pricePerWatt: prices[i],
            power: powers[i],
            owner: owners[i],
            physicalAddress: addresses[i],
            latitude: convertMicrodegreesToDecimal(latitudes[i]),
            longitude: convertMicrodegreesToDecimal(longitudes[i])
          });
        }
      }
      
      setStations(ownerStations);
      
      // Get earnings from ChargingBooking contract
      try {
        const bookingContract = await getContract('ChargingBooking', signer);
        const earnings = await bookingContract.getMyEarnings();
        console.log(earnings)
        const formattedEarnings = formatSEIAmount(earnings);
        setTotalEarnings(formattedEarnings);
        setAvailableWithdraw(formattedEarnings);
      } catch (error) {
        console.error('Error loading earnings:', error);
        setTotalEarnings('0.0000');
        setAvailableWithdraw('0.0000');
      }
    } catch (error) {
      console.error('Error loading owner data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegisterStation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signer) return;

    try {
      setIsRegistering(true);
      const stationContract = await getContract('ChargingStation', signer);
      
      const tx = await stationContract.registerStation(
        formData.uniqueId,
        formData.url,
        BigInt(Math.floor(parseFloat(formData.pricePerWatt) * 1e18)), // Convert to wei
        BigInt(Math.floor(parseFloat(formData.power) * 1000)), // Convert to watts
        formData.physicalAddress,
        convertDecimalToMicrodegrees(formData.latitude),
        convertDecimalToMicrodegrees(formData.longitude)
      );
      
      await tx.wait();
      
      // Reset form and close modal
      setFormData({
        uniqueId: '',
        url: '',
        pricePerWatt: '',
        power: '',
        physicalAddress: '',
        latitude: 0,
        longitude: 0
      });
      setShowRegisterModal(false);
      
      // Reload data
      await loadOwnerData();
    } catch (error) {
      console.error('Error registering station:', error);
      alert('Failed to register station. Please try again.');
    } finally {
      setIsRegistering(false);
    }
  };

  // Handle map location selection
  const handleLocationSelect = (lat: number, lng: number, address: string) => {
    setFormData(prev => ({
      ...prev,
      latitude: lat,
      longitude: lng,
      physicalAddress: address
    }));
  };

  // Handle withdraw earnings
  const handleWithdrawEarnings = async () => {
    if (!signer || !address) return;

    try {
      setIsWithdrawing(true);
      const bookingContract = await getContract('ChargingBooking', signer);
      
      // Get current earnings first
      const earnings = await bookingContract.getMyEarnings();
      
      if (earnings === BigInt(0)) {
        alert('No earnings available to withdraw.');
        return;
      }
      
      // Withdraw all available earnings
      const tx = await bookingContract.withdrawEarnings();
      await tx.wait();
      
      // Reload data to show updated balance
      await loadOwnerData();
      
      alert('Earnings withdrawn successfully!');
    } catch (error) {
      console.error('Error withdrawing earnings:', error);
      alert('Failed to withdraw earnings. Please try again.');
    } finally {
      setIsWithdrawing(false);
    }
  };

  // Function to open location in map
  const openLocationInMap = (latitude: number, longitude: number) => {
    const googleMapsUrl = `https://maps.google.com/maps?q=${latitude},${longitude}`;
    window.open(googleMapsUrl, '_blank');
  };

  const handleDisconnect = () => {
    disconnectWallet();
    router.push('/');
  };

  // Handle station editing
  const startEditStation = (station: Station) => {
    setEditingStation(station.id);
    setEditForm({
      power: (Number(station.power) / 1000).toString(), // Convert watts to kW
      pricePerWatt: formatSEIAmount(station.pricePerWatt)
    });
  };

  const cancelEditStation = () => {
    setEditingStation(null);
    setEditForm({ power: '', pricePerWatt: '' });
  };

  const handleUpdateStation = async (stationId: number) => {
    if (!signer) return;

    try {
      setIsUpdating(true);
      const stationContract = await getContract('ChargingStation', signer);
      
      const station = stations.find(s => s.id === stationId);
      if (!station) return;

      const newPowerWatts = BigInt(Math.floor(parseFloat(editForm.power) * 1000)); // Convert kW to watts
      const newPriceWei = BigInt(Math.floor(parseFloat(editForm.pricePerWatt) * 1e18)); // Convert to wei
      
      // Check if values actually changed
      const powerChanged = newPowerWatts !== station.power;
      const priceChanged = newPriceWei !== station.pricePerWatt;
      
      if (!powerChanged && !priceChanged) {
        cancelEditStation();
        return;
      }

      // Update power if changed
      if (powerChanged) {
        const powerTx = await stationContract.updatePower(stationId, newPowerWatts);
        await powerTx.wait();
      }

      // Update price if changed
      if (priceChanged) {
        const priceTx = await stationContract.updatePrice(stationId, newPriceWei);
        await priceTx.wait();
      }

      // Reload station data
      await loadOwnerData();
      
      // Close edit mode
      cancelEditStation();
      
      const updateTypes = [];
      if (powerChanged) updateTypes.push('power');
      if (priceChanged) updateTypes.push('price');
      
      alert(`Station ${updateTypes.join(' and ')} updated successfully!`);
      
    } catch (error) {
      console.error('Error updating station:', error);
      alert('Failed to update station. Please try again.');
    } finally {
      setIsUpdating(false);
    }
  };

  // Show nothing while checking for existing wallet connection
  if (!isInitialized) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black flex items-center justify-center">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
          <span className="text-white">Initializing...</span>
        </div>
      </div>
    );
  }

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
              <div className="bg-gradient-to-r from-blue-500 to-blue-700 w-10 h-10 rounded-lg flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Station Owner Dashboard</h1>
                <div className="text-sm text-gray-400">
                  {address?.slice(0, 6)}...{address?.slice(-4)}
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={() => setShowRegisterModal(true)}
              className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-blue-700 text-white font-medium rounded-lg hover:from-blue-600 hover:to-blue-800 transition-colors"
            >
              <Plus className="w-5 h-5" />
              <span>Register Station</span>
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

      {/* Statistics Cards */}
      <div className="px-6 mb-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-7xl mx-auto">
          <div className="glass rounded-xl p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-white">{stations.length}</div>
                <div className="text-gray-400 text-sm">Stations</div>
              </div>
              <MapPin className="w-8 h-8 text-blue-400" />
            </div>
          </div>
          <div className="glass rounded-xl p-6">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="text-2xl font-bold text-white">{totalEarnings} SEI</div>
                <div className="text-gray-400 text-sm">Available Earnings</div>
              </div>
              <div className="flex items-center space-x-3">
                <button
                  onClick={handleWithdrawEarnings}
                  disabled={isWithdrawing || parseFloat(availableWithdraw) === 0}
                  className="px-4 py-2 bg-gradient-to-r from-green-500 to-green-700 text-white font-medium rounded-lg hover:from-green-600 hover:to-green-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                >
                  {isWithdrawing ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                  <span>{isWithdrawing ? 'Withdrawing...' : 'Withdraw'}</span>
                </button>
                <DollarSign className="w-8 h-8 text-green-400" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Stations List */}
      <div className="px-6">
        <div className="max-w-7xl mx-auto">
          <div className="glass rounded-xl p-6">
            <h2 className="text-xl font-bold text-white mb-6">Your Stations</h2>
            
            {isLoading ? (
              <div className="flex justify-center py-12">
                <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : stations.length === 0 ? (
              <div className="text-center py-12">
                <MapPin className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-white mb-2">No stations registered</h3>
                <p className="text-gray-400 mb-4">Start earning by registering your first charging station</p>
                <button
                  onClick={() => setShowRegisterModal(true)}
                  className="px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-700 text-white font-medium rounded-lg hover:from-blue-600 hover:to-blue-800 transition-colors"
                >
                  Register Your First Station
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {stations.map((station) => (
                  <div key={station.id} className="bg-white/5 rounded-xl p-6 hover:bg-white/10 transition-colors">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="font-semibold text-white mb-1">{station.uniqueId}</h3>
                        <div className="text-gray-400 text-sm">{station.physicalAddress}</div>
                      </div>
                      <div className="flex items-center space-x-2">
                        {editingStation === station.id ? (
                          <>
                            <button
                              onClick={() => handleUpdateStation(station.id)}
                              disabled={isUpdating}
                              className="p-2 text-green-400 hover:text-green-300 transition-colors disabled:opacity-50"
                              title="Save changes"
                            >
                              {isUpdating ? (
                                <div className="w-4 h-4 border-2 border-green-400 border-t-transparent rounded-full animate-spin"></div>
                              ) : (
                                <span className="text-sm">✓</span>
                              )}
                            </button>
                            <button
                              onClick={cancelEditStation}
                              disabled={isUpdating}
                              className="p-2 text-red-400 hover:text-red-300 transition-colors disabled:opacity-50"
                              title="Cancel"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => startEditStation(station)}
                            className="p-2 text-gray-400 hover:text-white transition-colors"
                            title="Edit station"
                          >
                            <Settings className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                    
                    {editingStation === station.id ? (
                      // Edit Mode
                      <div className="space-y-4">
                        <div>
                          <label className="block text-gray-400 text-sm mb-1">Power (kW)</label>
                          <input
                            type="number"
                            step="0.1"
                            value={editForm.power}
                            onChange={(e) => setEditForm(prev => ({ ...prev, power: e.target.value }))}
                            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            placeholder="50"
                          />
                        </div>
                        <div>
                          <label className="block text-gray-400 text-sm mb-1">Price (SEI/Wh)</label>
                          <input
                            type="number"
                            step="0.0001"
                            value={editForm.pricePerWatt}
                            onChange={(e) => setEditForm(prev => ({ ...prev, pricePerWatt: e.target.value }))}
                            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            placeholder="0.0010"
                          />
                        </div>
                        <div className="text-xs text-yellow-400 bg-yellow-400/10 p-2 rounded">
                          💡 Note: Changing power may automatically adjust price. Price increases proportionally with power.
                        </div>
                      </div>
                    ) : (
                      // View Mode
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-400">Power:</span>
                          <span className="text-white">{Number(station.power) / 1000} kW</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400">Price:</span>
                          <span className="text-white">{formatSEIAmount(station.pricePerWatt)} SEI/Wh</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400">Location:</span>
                          <span className="text-white">{station.latitude.toFixed(4)}, {station.longitude.toFixed(4)}</span>
                        </div>
                      </div>
                    )}
                    
                    <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-700">
                      <div className="text-xs text-gray-400">Station ID: {station.id}</div>
                      <div className="flex space-x-2">
                        <button
                          onClick={() => openLocationInMap(station.latitude, station.longitude)}
                          className="px-3 py-1 bg-green-500/20 text-green-400 text-xs rounded-full hover:bg-green-500/30 transition-colors flex items-center space-x-1"
                        >
                          <MapPin className="w-3 h-3" />
                          <span>Open Location</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Registration Modal */}
      {showRegisterModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900/95 backdrop-blur-md border border-gray-700 rounded-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b border-gray-700">
              <h2 className="text-2xl font-bold text-white">Register New Station</h2>
              <button
                onClick={() => setShowRegisterModal(false)}
                className="p-2 text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="grid md:grid-cols-2 h-[70vh]">
              {/* Form Section */}
              <div className="p-6 overflow-y-auto">
                <form onSubmit={handleRegisterStation} className="space-y-4">
                  <div>
                    <label className="block text-white font-medium mb-2">Station Unique ID</label>
                    <input
                      type="text"
                      required
                      value={formData.uniqueId}
                      onChange={(e) => setFormData(prev => ({ ...prev, uniqueId: e.target.value }))}
                      className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="e.g., SOLAR-NYC-001"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-white font-medium mb-2">Station URL</label>
                    <input
                      type="url"
                      required
                      value={formData.url}
                      onChange={(e) => setFormData(prev => ({ ...prev, url: e.target.value }))}
                      className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="https://your-station-api.com"
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-white font-medium mb-2">Power (kW)</label>
                      <input
                        type="number"
                        step="0.1"
                        required
                        value={formData.power}
                        onChange={(e) => setFormData(prev => ({ ...prev, power: e.target.value }))}
                        className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="50"
                      />
                    </div>
                    <div>
                      <label className="block text-white font-medium mb-2">Price (SEI/Wh)</label>
                      <input
                        type="number"
                        step="0.0001"
                        required
                        value={formData.pricePerWatt}
                        onChange={(e) => setFormData(prev => ({ ...prev, pricePerWatt: e.target.value }))}
                        className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="0.0010"
                      />
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-white font-medium mb-2">Physical Address</label>
                    <input
                      type="text"
                      required
                      value={formData.physicalAddress}
                      onChange={(e) => setFormData(prev => ({ ...prev, physicalAddress: e.target.value }))}
                      className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Click on map or enter manually"
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-white font-medium mb-2">Latitude</label>
                      <input
                        type="number"
                        step="0.000001"
                        required
                        value={formData.latitude}
                        onChange={(e) => setFormData(prev => ({ ...prev, latitude: parseFloat(e.target.value) }))}
                        className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="40.7128"
                      />
                    </div>
                    <div>
                      <label className="block text-white font-medium mb-2">Longitude</label>
                      <input
                        type="number"
                        step="0.000001"
                        required
                        value={formData.longitude}
                        onChange={(e) => setFormData(prev => ({ ...prev, longitude: parseFloat(e.target.value) }))}
                        className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="-74.0060"
                      />
                    </div>
                  </div>
                  
                  <button
                    type="submit"
                    disabled={isRegistering}
                    className="w-full px-6 py-4 bg-gradient-to-r from-blue-500 to-blue-700 text-white font-semibold rounded-lg hover:from-blue-600 hover:to-blue-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isRegistering ? (
                      <div className="flex items-center justify-center space-x-2">
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        <span>Registering Station...</span>
                      </div>
                    ) : (
                      'Register Station'
                    )}
                  </button>
                </form>
              </div>
              
              {/* Map Section */}
              <div className="bg-gray-800 border-l border-gray-700">
                <MapboxMap
                  onLocationSelect={handleLocationSelect}
                  initialLat={formData.latitude || 40.7128}
                  initialLng={formData.longitude || -74.0060}
                  className="w-full h-full"
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}