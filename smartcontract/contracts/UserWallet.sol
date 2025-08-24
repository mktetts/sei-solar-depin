// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract UserWallet {
    address public admin;
    mapping(address => uint256) public userBalances;

    event Deposit(address indexed user, uint256 amount);
    event Withdrawal(address indexed user, uint256 amount);
    event TransactionExecuted(
        address indexed user,
        address indexed target,
        uint256 amount,
        uint256 gasUsed,
        uint256 gasPrice
    );

    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin can execute this function");
        _;
    }

    modifier hasBalance(address user, uint256 amount) {
        require(userBalances[user] >= amount, "Insufficient balance");
        _;
    }

    constructor() {
        admin = msg.sender;
    }

    function deposit() external payable {
        require(msg.value > 0, "Deposit amount must be greater than 0");
        userBalances[msg.sender] += msg.value;
        emit Deposit(msg.sender, msg.value);
    }

    function withdraw(uint256 amount) external hasBalance(msg.sender, amount) {
        userBalances[msg.sender] -= amount;
        payable(msg.sender).transfer(amount);
        emit Withdrawal(msg.sender, amount);
    }
     function executeTransaction(
         address user,
         address payable target,
         uint256 amount,
         bytes calldata data
     ) external onlyAdmin hasBalance(user, amount) {
         uint256 gasStart = gasleft();
         
         // Use realistic gas estimate: 250k gas for complex calls like ChargingBooking.buyPower
         uint256 estimatedGasCost = 250000 * tx.gasprice;
 
         // Check if user has enough balance for transaction + gas cost
         require(
             userBalances[user] >= amount + estimatedGasCost,
             "Insufficient balance for tx + gas"
         );
 
         // Execute transaction with sufficient gas limit
         (bool success, ) = target.call{gas: 250000, value: amount}(data);
         require(success, "Transaction execution failed");
 
         // Calculate actual gas cost and use the lower value to be fair
         uint256 actualGasCost = (gasStart - gasleft()) * tx.gasprice;
         uint256 gasCostToCharge = actualGasCost < estimatedGasCost ? actualGasCost : estimatedGasCost;
 
         // Deduct balance and transfer gas cost to admin
         userBalances[user] -= (amount + gasCostToCharge);
         
         if (gasCostToCharge > 0) {
             payable(admin).transfer(gasCostToCharge);
         }
 
         emit TransactionExecuted(user, target, amount, gasStart - gasleft(), tx.gasprice);
     }
    function getUserBalance(address user) external view returns (uint256) {
        return userBalances[user];
    }

    function getContractBalance() external view returns (uint256) {
        return address(this).balance;
    }

    // Function to handle refunds from contracts - credit back to user balances
    receive() external payable {
        // When ChargingBooking sends refunds, we need to know which user to credit
        // This is a limitation - we need a proper refund function instead
    }
    
    // Proper refund function that credits specific users
    function creditUserRefund(address user) external payable {
        require(msg.value > 0, "Refund amount must be greater than 0");
        require(user != address(0), "Invalid user address");
        
        userBalances[user] += msg.value;
        emit Deposit(user, msg.value);
    }

    // Emergency function to change admin (only current admin)
    function changeAdmin(address newAdmin) external onlyAdmin {
        require(newAdmin != address(0), "New admin cannot be zero address");
        admin = newAdmin;
    }
}
