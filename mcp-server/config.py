import json
import os
from typing import Dict, Any

def load_contract_address(contract_name: str) -> str:
    """Load contract address from JSON file."""
    try:
        with open(f"contracts/{contract_name}_address.json", "r") as f:
            data = json.load(f)
            return data["address"]
    except FileNotFoundError:
        raise FileNotFoundError(f"Contract address file for {contract_name} not found")
    except KeyError:
        raise KeyError(f"Address field not found in {contract_name} address file")

def load_contract_abi(contract_name: str) -> list:
    """Load contract ABI from JSON file."""
    try:
        with open(f"contracts/{contract_name}_contract.json", "r") as f:
            return json.load(f)
    except FileNotFoundError:
        raise FileNotFoundError(f"Contract ABI file for {contract_name} not found")

class ContractConfig:
    """Container for contract addresses and ABIs."""
    
    def __init__(self):
        # Load addresses
        self.CHARGING_BOOKING_ADDRESS = load_contract_address("ChargingBooking")
        self.USER_WALLET_ADDRESS = load_contract_address("UserWallet")
        self.CHARGING_STATION_ADDRESS = load_contract_address("ChargingStation")
        
        # Load ABIs
        self.CHARGING_BOOKING_ABI = load_contract_abi("ChargingBooking")
        self.USER_WALLET_ABI = load_contract_abi("UserWallet")
        self.CHARGING_STATION_ABI = load_contract_abi("ChargingStation")
        
        # Environment variables
        self.RPC_URL = os.getenv("SEI_RPC_URL", "http://127.0.0.1:8545")
        self.ADMIN_PRIVATE_KEY = os.getenv("ADMIN_PRIVATE_KEY")
        
        if not self.ADMIN_PRIVATE_KEY:
            raise ValueError("ADMIN_PRIVATE_KEY environment variable is required")

# Global config instance
config = ContractConfig()