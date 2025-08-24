from typing import Dict, Any
from pydantic import BaseModel
from fastmcp import FastMCP
import sys
import os

# Add parent directory to path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from blockchain import blockchain

# Request models
class DepositRequest(BaseModel):
    user_address: str
    amount: float  # in ETH

class WithdrawRequest(BaseModel):
    user_address: str
    amount: float  # in ETH

class ChangeAdminRequest(BaseModel):
    new_admin_address: str

def register_user_wallet_tools(mcp: FastMCP):
    """Register all UserWallet contract tools."""
    
    @mcp.tool()
    async def deposit_to_wallet(request: DepositRequest) -> Dict[str, Any]:
        """Deposit ETH to a user's wallet for gas and transaction management."""
        try:
            amount_wei = blockchain.eth_to_wei(request.amount)
            
            # Build deposit transaction
            transaction = blockchain.user_wallet_contract.functions.deposit().build_transaction({
                'from': request.user_address,
                'value': amount_wei,
                'gas': 100000,
            })
            
            result = blockchain.send_transaction(transaction)
            
            if result["success"]:
                # Decode Deposit event
                deposit_events = blockchain.decode_event_logs(
                    blockchain.user_wallet_contract,
                    'Deposit',
                    result["receipt"].logs
                )
                
                if deposit_events:
                    event = deposit_events[0]
                    result.update({
                        "deposited_amount": event.amount,
                        "deposited_amount_eth": blockchain.wei_to_eth(event.amount),
                        "user": event.user
                    })
                
                result.update({
                    "amount_deposited": amount_wei,
                    "amount_deposited_eth": request.amount,
                    "user_address": request.user_address
                })
                
            return result
            
        except Exception as e:
            return {"success": False, "error": str(e)}

    @mcp.tool()
    async def withdraw_from_wallet(request: WithdrawRequest) -> Dict[str, Any]:
        """Withdraw ETH from a user's wallet (user must initiate this themselves)."""
        try:
            amount_wei = blockchain.eth_to_wei(request.amount)
            
            # Note: This needs to be called by the user themselves, not the admin
            # This is a simulation of what the user would need to do
            return {
                "success": False,
                "error": "Withdrawal must be initiated by the user themselves",
                "instruction": f"User {request.user_address} needs to call withdraw({amount_wei}) directly",
                "amount_wei": amount_wei,
                "amount_eth": request.amount
            }
            
        except Exception as e:
            return {"success": False, "error": str(e)}

    @mcp.tool()
    async def get_user_balance(user_address: str) -> Dict[str, Any]:
        """Get the balance of a specific user in the wallet."""
        print(user_address)
        try:
            balance = blockchain.user_wallet_contract.functions.getUserBalance(user_address).call()
            
            return {
                "success": True,
                "user": user_address,
                "balance": balance,
                "balance_eth": blockchain.wei_to_eth(balance)
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

    @mcp.tool()
    async def get_wallet_contract_balance() -> Dict[str, Any]:
        """Get the total balance of the UserWallet contract."""
        try:
            balance = blockchain.user_wallet_contract.functions.getContractBalance().call()
            
            return {
                "success": True,
                "contract_balance": balance,
                "contract_balance_eth": blockchain.wei_to_eth(balance)
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

    @mcp.tool()
    async def get_wallet_admin() -> Dict[str, Any]:
        """Get the current admin address of the UserWallet contract."""
        try:
            admin = blockchain.user_wallet_contract.functions.admin().call()
            
            return {
                "success": True,
                "admin_address": admin,
                "is_current_admin": admin.lower() == blockchain.admin_account.address.lower()
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

    @mcp.tool()
    async def change_wallet_admin(request: ChangeAdminRequest) -> Dict[str, Any]:
        """Change the admin of the UserWallet contract (only current admin can do this)."""
        try:
            # Build changeAdmin transaction
            transaction = blockchain.user_wallet_contract.functions.changeAdmin(
                request.new_admin_address
            ).build_transaction({
                'from': blockchain.admin_account.address,
                'gas': 100000,
            })
            
            result = blockchain.send_transaction(transaction)
            
            if result["success"]:
                result.update({
                    "new_admin": request.new_admin_address,
                    "previous_admin": blockchain.admin_account.address
                })
                
            return result
            
        except Exception as e:
            return {"success": False, "error": str(e)}

    @mcp.tool()
    async def execute_transaction_for_user(
        user_address: str, 
        target_address: str, 
        amount_eth: float, 
        data: str = "0x"
    ) -> Dict[str, Any]:
        """Execute a transaction on behalf of a user through the UserWallet contract."""
        try:
            amount_wei = blockchain.eth_to_wei(amount_eth)
            
            # Convert data to bytes
            data_bytes = bytes.fromhex(data[2:] if data.startswith('0x') else data)
            
            # Build executeTransaction
            transaction = blockchain.user_wallet_contract.functions.executeTransaction(
                user_address,
                target_address,
                amount_wei,
                data_bytes
            ).build_transaction({
                'from': blockchain.admin_account.address,
                'gas': 500000,  # High gas limit for complex operations
            })
            
            result = blockchain.send_transaction(transaction)
            
            if result["success"]:
                # Decode TransactionExecuted event
                tx_events = blockchain.decode_event_logs(
                    blockchain.user_wallet_contract,
                    'TransactionExecuted',
                    result["receipt"].logs
                )
                
                if tx_events:
                    event = tx_events[0]
                    result.update({
                        "executed_for_user": event.user,
                        "target_contract": event.target,
                        "amount_sent": event.amount,
                        "amount_sent_eth": blockchain.wei_to_eth(event.amount),
                        "gas_used_by_user": event.gasUsed,
                        "gas_price": event.gasPrice,
                        "gas_cost": event.gasUsed * event.gasPrice,
                        "gas_cost_eth": blockchain.wei_to_eth(event.gasUsed * event.gasPrice)
                    })
                
                result.update({
                    "user_address": user_address,
                    "target_address": target_address,
                    "amount_wei": amount_wei,
                    "amount_eth": amount_eth,
                    "data": data
                })
                
            return result
            
        except Exception as e:
            return {"success": False, "error": str(e)}

    @mcp.tool()
    async def simulate_user_deposit(user_address: str, amount_eth: float) -> Dict[str, Any]:
        """Simulate a deposit transaction (for testing - admin deposits on behalf of user)."""
        try:
            amount_wei = blockchain.eth_to_wei(amount_eth)
            
            # Admin deposits and then credits user's balance
            # This is a workaround since we're using admin account
            
            # First, send ETH to the contract
            transaction = {
                'to': blockchain.user_wallet_contract.address,
                'value': amount_wei,
                'gas': 21000,
                'from': blockchain.admin_account.address
            }
            
            result = blockchain.send_transaction(transaction)
            
            if result["success"]:
                # Manually credit user balance (this would normally be done by the user calling deposit())
                result.update({
                    "note": "Simulated deposit - ETH sent to contract",
                    "user_address": user_address,
                    "amount_wei": amount_wei,
                    "amount_eth": amount_eth,
                    "warning": "In production, user should call deposit() function themselves"
                })
                
            return result
            
        except Exception as e:
            return {"success": False, "error": str(e)}

    @mcp.tool()
    async def check_user_can_afford_transaction(
        user_address: str, 
        transaction_amount_eth: float, 
        estimated_gas: int = 300000
    ) -> Dict[str, Any]:
        """Check if a user has sufficient balance for a transaction including gas costs."""
        try:
            user_balance = blockchain.user_wallet_contract.functions.getUserBalance(user_address).call()
            transaction_amount_wei = blockchain.eth_to_wei(transaction_amount_eth)
            
            # Estimate gas cost
            gas_price = blockchain.get_gas_price()
            estimated_gas_cost = estimated_gas * gas_price
            total_required = transaction_amount_wei + estimated_gas_cost
            
            can_afford = user_balance >= total_required
            
            return {
                "success": True,
                "user_address": user_address,
                "user_balance": user_balance,
                "user_balance_eth": blockchain.wei_to_eth(user_balance),
                "transaction_amount": transaction_amount_wei,
                "transaction_amount_eth": transaction_amount_eth,
                "estimated_gas_cost": estimated_gas_cost,
                "estimated_gas_cost_eth": blockchain.wei_to_eth(estimated_gas_cost),
                "total_required": total_required,
                "total_required_eth": blockchain.wei_to_eth(total_required),
                "can_afford": can_afford,
                "shortfall": max(0, total_required - user_balance),
                "shortfall_eth": blockchain.wei_to_eth(max(0, total_required - user_balance))
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

    @mcp.tool()
    async def get_gas_estimates() -> Dict[str, Any]:
        """Get current gas price and common operation estimates."""
        try:
            gas_price = blockchain.get_gas_price()
            
            # Common operation estimates
            operations = {
                "simple_transfer": 21000,
                "deposit_to_wallet": 50000,
                "buy_power": 300000,
                "emergency_stop": 200000,
                "withdraw_earnings": 100000
            }
            
            estimates = {}
            for op, gas in operations.items():
                cost_wei = gas * gas_price
                estimates[op] = {
                    "gas_limit": gas,
                    "gas_cost_wei": cost_wei,
                    "gas_cost_eth": blockchain.wei_to_eth(cost_wei)
                }
            
            return {
                "success": True,
                "current_gas_price": gas_price,
                "current_gas_price_gwei": gas_price / 1e9,
                "operations": estimates
            }
        except Exception as e:
            return {"success": False, "error": str(e)}