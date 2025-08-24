import { ethers } from 'ethers';

export interface ContractInfo {
  address: string;
  abi: any[];
}

export interface Contracts {
  UserWallet: ContractInfo;
  ChargingStation: ContractInfo;
  ChargingBooking: ContractInfo;
}

// Dynamically load contract data
export async function getContracts(): Promise<Contracts> {
  try {
    // Load addresses
    const userWalletAddress = await import('@/contracts/UserWallet_address.json');
    const chargingStationAddress = await import('@/contracts/ChargingStation_address.json');
    const chargingBookingAddress = await import('@/contracts/ChargingBooking_address.json');
    
    // Load ABIs
    const userWalletABI = await import('@/contracts/UserWallet_contract.json');
    const chargingStationABI = await import('@/contracts/ChargingStation_contract.json');
    const chargingBookingABI = await import('@/contracts/ChargingBooking_contract.json');
    
    return {
      UserWallet: {
        address: userWalletAddress.address,
        abi: userWalletABI.default
      },
      ChargingStation: {
        address: chargingStationAddress.address,
        abi: chargingStationABI.default
      },
      ChargingBooking: {
        address: chargingBookingAddress.address,
        abi: chargingBookingABI.default
      }
    };
  } catch (error) {
    console.error('Failed to load contract data:', error);
    throw error;
  }
}

export async function getContract(
  contractName: keyof Contracts,
  signerOrProvider: ethers.Signer | ethers.Provider
): Promise<ethers.Contract> {
  const contracts = await getContracts();
  const contractInfo = contracts[contractName];
  
  return new ethers.Contract(
    contractInfo.address,
    contractInfo.abi,
    signerOrProvider
  );
}

export async function getReadOnlyContract(
  contractName: keyof Contracts,
  provider: ethers.Provider
): Promise<ethers.Contract> {
  return getContract(contractName, provider);
}