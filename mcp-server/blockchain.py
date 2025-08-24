from web3 import Web3
from web3.exceptions import ContractLogicError
from config import config
import json
from typing import Dict, Any, Optional

class BlockchainService:
    """Service for blockchain interactions."""
    
    def __init__(self):
        self.web3 = Web3(Web3.HTTPProvider(config.RPC_URL))
        
        if not self.web3.is_connected():
            raise ConnectionError(f"Failed to connect to blockchain at {config.RPC_URL}")
        
        # Initialize admin account
        if config.ADMIN_PRIVATE_KEY:
            self.admin_account = self.web3.eth.account.from_key(config.ADMIN_PRIVATE_KEY)
        else:
            raise ValueError("Admin private key is required")
        
        # Initialize contracts
        self.charging_booking_contract = self.web3.eth.contract(
            address=config.CHARGING_BOOKING_ADDRESS,
            abi=config.CHARGING_BOOKING_ABI
        )
        
        self.user_wallet_contract = self.web3.eth.contract(
            address=config.USER_WALLET_ADDRESS,
            abi=config.USER_WALLET_ABI
        )
        
        self.charging_station_contract = self.web3.eth.contract(
            address=config.CHARGING_STATION_ADDRESS,
            abi=config.CHARGING_STATION_ABI
        )
    
    def get_gas_price(self) -> int:
        """Get current gas price."""
        return self.web3.eth.gas_price
    
    def get_nonce(self, address: Optional[str] = None) -> int:
        """Get transaction nonce for address."""
        addr = address or self.admin_account.address
        return self.web3.eth.get_transaction_count(addr)
    
    def send_transaction(self, transaction: Dict[str, Any]) -> Dict[str, Any]:
        """Sign and send transaction."""
        try:
            # Add gas price and nonce if not provided
            if 'gasPrice' not in transaction:
                transaction['gasPrice'] = self.get_gas_price()
            if 'nonce' not in transaction:
                transaction['nonce'] = self.get_nonce(transaction['from'])
            
            # Sign transaction
            signed_txn = self.web3.eth.account.sign_transaction(
                transaction,
                config.ADMIN_PRIVATE_KEY
            )
            
            # Send transaction - handle both old and new Web3.py versions
            raw_tx = getattr(signed_txn, 'raw_transaction', None) or getattr(signed_txn, 'rawTransaction', None)
            if raw_tx is None:
                raise ValueError("Unable to get raw transaction data from signed transaction")
            
            tx_hash = self.web3.eth.send_raw_transaction(raw_tx)
            
            # Wait for receipt
            receipt = self.web3.eth.wait_for_transaction_receipt(tx_hash)
            
            # Create JSON-serializable receipt
            serializable_receipt = self._make_receipt_serializable(receipt)
            
            return {
                "success": True,
                "transaction_hash": tx_hash.hex() if hasattr(tx_hash, 'hex') else str(tx_hash),
                "gas_used": serializable_receipt.get('gasUsed', 0),
                "status": serializable_receipt.get('status', 0),
                "block_number": serializable_receipt.get('blockNumber', 0),
                "receipt": serializable_receipt
            }
            
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "transaction": transaction
            }
    
    def _make_receipt_serializable(self, receipt) -> Dict[str, Any]:
        """Convert receipt to JSON-serializable format."""
        try:
            if isinstance(receipt, dict):
                # Already a dict, but clean it up
                serializable = {}
                for key, value in receipt.items():
                    if isinstance(value, bytes):
                        serializable[key] = value.hex()
                    elif isinstance(value, list):
                        # Handle logs array
                        serializable[key] = [self._clean_log_entry(log) for log in value]
                    else:
                        serializable[key] = value
                return serializable
            else:
                # Convert AttributeDict/object to dict
                serializable = {
                    'blockHash': getattr(receipt, 'blockHash', b'').hex() if hasattr(receipt, 'blockHash') else '',
                    'blockNumber': getattr(receipt, 'blockNumber', 0),
                    'contractAddress': getattr(receipt, 'contractAddress', None),
                    'cumulativeGasUsed': getattr(receipt, 'cumulativeGasUsed', 0),
                    'effectiveGasPrice': getattr(receipt, 'effectiveGasPrice', 0),
                    'from': getattr(receipt, 'from', ''),
                    'gasUsed': getattr(receipt, 'gasUsed', 0),
                    'logs': [self._clean_log_entry(log) for log in getattr(receipt, 'logs', [])],
                    'logsBloom': getattr(receipt, 'logsBloom', b'').hex() if hasattr(receipt, 'logsBloom') else '',
                    'status': getattr(receipt, 'status', 0),
                    'to': getattr(receipt, 'to', ''),
                    'transactionHash': getattr(receipt, 'transactionHash', b'').hex() if hasattr(receipt, 'transactionHash') else '',
                    'transactionIndex': getattr(receipt, 'transactionIndex', 0),
                    'type': getattr(receipt, 'type', '0x0')
                }
                return serializable
        except Exception:
            # Fallback to basic info if conversion fails
            return {
                'gasUsed': getattr(receipt, 'gasUsed', 0),
                'status': getattr(receipt, 'status', 0),
                'blockNumber': getattr(receipt, 'blockNumber', 0),
                'logs': []
            }
    
    def _clean_log_entry(self, log) -> Dict[str, Any]:
        """Clean a single log entry for JSON serialization."""
        try:
            if isinstance(log, dict):
                cleaned = {}
                for key, value in log.items():
                    if isinstance(value, bytes):
                        cleaned[key] = value.hex()
                    elif isinstance(value, list):
                        cleaned[key] = [item.hex() if isinstance(item, bytes) else item for item in value]
                    else:
                        cleaned[key] = value
                return cleaned
            else:
                return {
                    'address': getattr(log, 'address', ''),
                    'topics': [topic.hex() if isinstance(topic, bytes) else str(topic) for topic in getattr(log, 'topics', [])],
                    'data': getattr(log, 'data', b'').hex() if hasattr(log, 'data') else '',
                    'blockNumber': getattr(log, 'blockNumber', 0),
                    'transactionHash': getattr(log, 'transactionHash', b'').hex() if hasattr(log, 'transactionHash') else '',
                    'transactionIndex': getattr(log, 'transactionIndex', 0),
                    'blockHash': getattr(log, 'blockHash', b'').hex() if hasattr(log, 'blockHash') else '',
                    'logIndex': getattr(log, 'logIndex', 0),
                    'removed': getattr(log, 'removed', False)
                }
        except Exception:
            return {'data': '', 'topics': [], 'address': ''}
    
    def execute_user_wallet_transaction(
        self,
        user_address: str,
        target_address: str,
        amount: int,
        data: str = "0x"
    ) -> Dict[str, Any]:
        """Execute transaction through UserWallet contract."""
        try:
            # Handle hex data conversion safely
            if data and data != "0x":
                hex_data = data[2:] if data.startswith('0x') else data
                try:
                    data_bytes = bytes.fromhex(hex_data)
                except ValueError as hex_error:
                    return {"success": False, "error": f"Invalid hex data: {hex_error}"}
            else:
                data_bytes = b''
            
            # Build transaction
            transaction = self.user_wallet_contract.functions.executeTransaction(
                user_address,
                target_address,
                amount,
                data_bytes
            ).build_transaction({
                'from': self.admin_account.address,
                'gas': 500000,  # High gas limit for complex operations
                'gasPrice': self.get_gas_price(),
                'nonce': self.get_nonce(self.admin_account.address)
            })
            
            return self.send_transaction(transaction)
            
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    def encode_function_call(self, contract, function_name: str, args: list) -> str:
        """Encode function call data."""
        try:
            function = getattr(contract.functions, function_name)
            return function(*args).build_transaction({'gas': 0})['data']
        except Exception as e:
            raise ValueError(f"Failed to encode function call: {e}")
    
    def decode_event_logs(self, contract, event_name: str, logs: list) -> list:
        """Decode event logs."""
        decoded_events = []
        try:
            event = getattr(contract.events, event_name)
            print(f"DEBUG: decode_event_logs - Looking for event: {event_name}")
            print(f"DEBUG: decode_event_logs - Total logs to process: {len(logs)}")
        except AttributeError as e:
            print(f"DEBUG: decode_event_logs - Event {event_name} not found in contract: {e}")
            return []
        
        for i, log in enumerate(logs):
            try:
                print(f"DEBUG: decode_event_logs - Processing log {i}: address={log.get('address', 'N/A')}")
                print(f"DEBUG: decode_event_logs - Log {i} topics: {log.get('topics', [])}")
                print(f"DEBUG: decode_event_logs - Log {i} data: {log.get('data', 'N/A')}")
                
                decoded_log = event().process_log(log)
                print(f"DEBUG: decode_event_logs - Decoded log type: {type(decoded_log)}")
                print(f"DEBUG: decode_event_logs - Decoded log content: {decoded_log}")
                
                # Handle both dictionary and object returns
                if hasattr(decoded_log, 'args'):
                    decoded_events.append(decoded_log.args)
                    print(f"DEBUG: decode_event_logs - Successfully decoded log {i} for {event_name} (object with .args)")
                elif isinstance(decoded_log, dict) and 'args' in decoded_log:
                    decoded_events.append(decoded_log['args'])
                    print(f"DEBUG: decode_event_logs - Successfully decoded log {i} for {event_name} (dict with 'args')")
                elif isinstance(decoded_log, dict):
                    # If it's a dict without 'args' key, try to use the dict itself
                    decoded_events.append(decoded_log)
                    print(f"DEBUG: decode_event_logs - Successfully decoded log {i} for {event_name} (raw dict)")
                else:
                    print(f"DEBUG: decode_event_logs - Unknown decoded log format for {event_name}: {type(decoded_log)}")
                    
            except Exception as decode_error:
                print(f"DEBUG: decode_event_logs - Failed to decode log {i} for {event_name}: {decode_error}")
                continue
                
        print(f"DEBUG: decode_event_logs - Final result: {len(decoded_events)} {event_name} events decoded")
        return decoded_events
    
    def wei_to_sei(self, wei_amount: int) -> float:
        """Convert wei to SEI."""
        result = self.web3.from_wei(wei_amount, 'ether')
        return float(result)
    
    def sei_to_wei(self, sei_amount: float) -> int:
        """Convert SEI to wei."""
        return self.web3.to_wei(sei_amount, 'ether')
    
    # Backward compatibility aliases
    def wei_to_eth(self, wei_amount: int) -> float:
        """Convert wei to SEI (backward compatibility)."""
        result = self.web3.from_wei(wei_amount, 'ether')
        return float(result)
    
    def eth_to_wei(self, eth_amount: float) -> int:
        """Convert SEI to wei (backward compatibility)."""
        return self.sei_to_wei(eth_amount)

# Global blockchain service instance
blockchain = BlockchainService()