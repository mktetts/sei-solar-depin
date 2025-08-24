// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./ChargingStation.sol";

contract ChargingBooking {
    enum BookingStatus { ACTIVE, COMPLETED, STOPPED }
    
    struct Booking {
        address user;
        uint256 stationId;
        uint256 watt; // Original watts requested (scaled by 1000 for 3 decimal places)
        uint256 power; // Power (scaled by 1000 for 3 decimal places)
        uint256 pricePaid; // Total amount paid
        uint256 timestamp;
        bool exists;
        BookingStatus status;
        uint256 wattsConsumed; // Actual watts consumed (scaled by 1000)
        uint256 refundAmount; // Amount refunded (if any)
    }

    // Fixed-point scaling factor for 3 decimal places
    uint256 public constant SCALE_FACTOR = 1000;

    ChargingStation public chargingStation;
    address public userWalletContract;
    mapping(uint256 => Booking) public bookings;
    mapping(address => uint256[]) public userBookings;
    mapping(address => uint256) public ownerEarnings; // Track earnings per station owner
    uint256 public bookingCount;

    modifier onlyUserWallet() {
        require(
            msg.sender == userWalletContract,
            "Only UserWallet contract can execute this function"
        );
        _;
    }

    event BookingCreated(
        uint256 indexed bookingId,
        address indexed user,
        uint256 indexed stationId,
        uint256 watt,
        uint256 power,
        uint256 pricePaid
    );

    event PowerPurchased(
        uint256 indexed bookingId,
        address indexed user,
        uint256 indexed stationId,
        uint256 totalCost
    );

    event EarningsWithdrawn(address indexed owner, uint256 amount);

    event EmergencyStop(
        uint256 indexed bookingId,
        address indexed user,
        uint256 wattsConsumed,
        uint256 refundAmount
    );

    event DeviceControlTriggered(
        uint256 indexed bookingId,
        uint256 indexed stationId,
        address indexed user,
        string deviceURL,
        uint256 watt,
        uint256 power,
        string httpEndpoint
    );

    event EmergencyStopTriggered(
        uint256 indexed bookingId,
        uint256 indexed stationId,
        address indexed user,
        string deviceURL,
        uint256 wattsConsumed,
        uint256 refundAmount,
        string httpEndpoint
    );

    constructor(address _chargingStationAddress, address _userWalletContract) {
        require(
            _chargingStationAddress != address(0),
            "Invalid ChargingStation address"
        );
        require(
            _userWalletContract != address(0),
            "Invalid UserWallet address"
        );
        chargingStation = ChargingStation(_chargingStationAddress);
        userWalletContract = _userWalletContract;
    }

    function calculatePrice(
        uint256 stationId,
        uint256 watt, // Scaled by 1000 (e.g., 1500 = 1.5 watts)
        uint256 power // Scaled by 1000 (e.g., 2500 = 2.5 power)
    ) public view returns (uint256) {
        uint256 pricePerWatt = chargingStation.getStationPrice(stationId);
        uint256 stationPower = chargingStation.getStationPower(stationId);

        require(
            power <= stationPower * SCALE_FACTOR,
            "Requested power exceeds station capacity"
        );
        require(watt > 0 && power > 0, "Watt and power must be greater than 0");

        // Calculate total cost: (watt * power * pricePerWatt) / (SCALE_FACTOR * SCALE_FACTOR)
        // This accounts for both watt and power being scaled by 1000
        return (watt * power * pricePerWatt) / (SCALE_FACTOR * SCALE_FACTOR);
    }

    function queryPrice(
        uint256 stationId,
        uint256 watt,
        uint256 power
    ) external view returns (uint256) {
        return calculatePrice(stationId, watt, power);
    }

    function prebookCharging(
        address user,
        uint256 stationId,
        uint256 watt,
        uint256 power
    ) external onlyUserWallet returns (uint256) {
        // uint256 totalCost = calculatePrice(stationId, watt, power);

        bookings[bookingCount] = Booking({
            user: user,
            stationId: stationId,
            watt: watt,
            power: power,
            pricePaid: 0, // Not paid yet, just prebooked
            timestamp: block.timestamp,
            exists: true,
            status: BookingStatus.ACTIVE,
            wattsConsumed: 0,
            refundAmount: 0
        });

        userBookings[user].push(bookingCount);

        emit BookingCreated(bookingCount, user, stationId, watt, power, 0);

        uint256 currentBookingId = bookingCount;
        bookingCount++;

        return currentBookingId;
    }

    function buyPower(
        address user,
        uint256 stationId,
        uint256 watt,
        uint256 power
    ) external payable onlyUserWallet returns (uint256) {
        uint256 totalCost = calculatePrice(stationId, watt, power);
        require(msg.value >= totalCost, "Insufficient payment");

        bookings[bookingCount] = Booking({
            user: user,
            stationId: stationId,
            watt: watt,
            power: power,
            pricePaid: totalCost,
            timestamp: block.timestamp,
            exists: true,
            status: BookingStatus.ACTIVE,
            wattsConsumed: 0,
            refundAmount: 0
        });

        userBookings[user].push(bookingCount);

        // Track earnings for station owner
        address stationOwner = chargingStation.getStationOwner(stationId);
        ownerEarnings[stationOwner] += totalCost;

        emit BookingCreated(
            bookingCount,
            user,
            stationId,
            watt,
            power,
            totalCost
        );
        emit PowerPurchased(bookingCount, user, stationId, totalCost);

        // Get station URL and emit device control event for HTTP trigger
        string memory stationURL = chargingStation.getStationURL(stationId);
        string memory httpEndpoint = string(abi.encodePacked("/toggle/", _uint2str(watt), "/", _uint2str(power)));
        
        emit DeviceControlTriggered(
            bookingCount,
            stationId,
            user,
            stationURL,
            watt,
            power,
            httpEndpoint
        );

        // Refund excess payment to UserWallet contract with proper user credit
        if (msg.value > totalCost) {
            uint256 excessAmount = msg.value - totalCost;
            // Call UserWallet's creditUserRefund function to properly credit the user
            (bool success, ) = userWalletContract.call{value: excessAmount}(
                abi.encodeWithSignature("creditUserRefund(address)", user)
            );
            require(success, "Failed to refund excess payment to user");
        }

        uint256 currentBookingId = bookingCount;
        bookingCount++;

        return currentBookingId;
    }

    function emergencyStop(
        address user,
        uint256 bookingId,
        uint256 wattsConsumed
    ) external onlyUserWallet returns (uint256) {
        require(bookings[bookingId].exists, "Booking does not exist");
        require(bookings[bookingId].user == user, "Only booking owner can emergency stop");
        require(bookings[bookingId].status == BookingStatus.ACTIVE, "Booking is not active");
        require(bookings[bookingId].pricePaid > 0, "Cannot emergency stop prebookings");
        require(wattsConsumed <= bookings[bookingId].watt, "Consumed watts cannot exceed booked watts");

        Booking storage booking = bookings[bookingId];
        
        // Calculate refund for unused watts (all values are scaled by 1000)
        uint256 unusedWatts = booking.watt - wattsConsumed;
        uint256 pricePerWatt = chargingStation.getStationPrice(booking.stationId);
        uint256 refundAmount = (unusedWatts * booking.power * pricePerWatt) / (SCALE_FACTOR * SCALE_FACTOR);
        
        // Ensure refund doesn't exceed amount paid
        if (refundAmount > booking.pricePaid) {
            refundAmount = booking.pricePaid;
        }

        // Update booking details
        booking.status = BookingStatus.STOPPED;
        booking.wattsConsumed = wattsConsumed;
        booking.refundAmount = refundAmount;

        // Reduce owner earnings by refund amount
        address stationOwner = chargingStation.getStationOwner(booking.stationId);
        require(ownerEarnings[stationOwner] >= refundAmount, "Insufficient owner earnings for refund");
        ownerEarnings[stationOwner] -= refundAmount;

        // Transfer refund to UserWallet contract with proper user credit
        if (refundAmount > 0) {
            require(address(this).balance >= refundAmount, "Insufficient contract balance for refund");
            // Call UserWallet's creditUserRefund function to properly credit the user
            (bool success, ) = userWalletContract.call{value: refundAmount}(
                abi.encodeWithSignature("creditUserRefund(address)", user)
            );
            require(success, "Failed to refund to user");
        }

        emit EmergencyStop(bookingId, user, wattsConsumed, refundAmount);

        // Get station URL and emit emergency stop device control event for HTTP trigger
        string memory stationURL = chargingStation.getStationURL(booking.stationId);
        string memory httpEndpoint = "/stop";
        
        emit EmergencyStopTriggered(
            bookingId,
            booking.stationId,
            user,
            stationURL,
            wattsConsumed,
            refundAmount,
            httpEndpoint
        );
        
        return refundAmount;
    }

    function getAllChargingPoints()
        external
        view
        returns (
            uint256[] memory stationIds,
            string[] memory stationUniqueIds,
            string[] memory metadataURLs,
            uint256[] memory pricesPerWatt,
            uint256[] memory powers,
            address[] memory owners,
            string[] memory physicalAddresses,
            int256[] memory latitudes,
            int256[] memory longitudes
        )
    {
        return chargingStation.getAllStations();
    }

    function getBooking(
        uint256 bookingId
    )
        external
        view
        returns (
            address user,
            uint256 stationId,
            uint256 watt,
            uint256 power,
            uint256 pricePaid,
            uint256 timestamp,
            BookingStatus status,
            uint256 wattsConsumed,
            uint256 refundAmount
        )
    {
        require(bookings[bookingId].exists, "Booking does not exist");

        Booking memory booking = bookings[bookingId];
        return (
            booking.user,
            booking.stationId,
            booking.watt,
            booking.power,
            booking.pricePaid,
            booking.timestamp,
            booking.status,
            booking.wattsConsumed,
            booking.refundAmount
        );
    }

    function getUserBookings(
        address user
    ) external view returns (uint256[] memory) {
        return userBookings[user];
    }

    function getBookingCount() external view returns (uint256) {
        return bookingCount;
    }

    // Function to withdraw earnings (only station owner can withdraw their earnings)
    function withdrawEarnings() external {
        uint256 earnings = ownerEarnings[msg.sender];
        require(earnings > 0, "No earnings to withdraw");
        require(
            address(this).balance >= earnings,
            "Insufficient contract balance"
        );

        ownerEarnings[msg.sender] = 0;
        payable(msg.sender).transfer(earnings);

        emit EarningsWithdrawn(msg.sender, earnings);
    }

    // Function to check earnings for a specific owner
    function getOwnerEarnings(address owner) external view returns (uint256) {
        return ownerEarnings[owner];
    }

    // Function to check caller's earnings
    function getMyEarnings() external view returns (uint256) {
        return ownerEarnings[msg.sender];
    }

    function getContractBalance() external view returns (uint256) {
        return address(this).balance;
    }
    
    // Function to get all users and amounts paid for a particular station
    function getStationBookings(uint256 stationId) 
        external 
        view 
        returns (
            address[] memory users,
            uint256[] memory amountsPaid,
            uint256[] memory bookingIds
        ) 
    {
        // First, count how many bookings exist for this station
        uint256 stationBookingCount = 0;
        for (uint256 i = 0; i < bookingCount; i++) {
            if (bookings[i].exists && bookings[i].stationId == stationId && bookings[i].pricePaid > 0) {
                stationBookingCount++;
            }
        }
        
        // Initialize arrays
        users = new address[](stationBookingCount);
        amountsPaid = new uint256[](stationBookingCount);
        bookingIds = new uint256[](stationBookingCount);
        
        // Populate arrays
        uint256 index = 0;
        for (uint256 i = 0; i < bookingCount; i++) {
            if (bookings[i].exists && bookings[i].stationId == stationId && bookings[i].pricePaid > 0) {
                users[index] = bookings[i].user;
                amountsPaid[index] = bookings[i].pricePaid;
                bookingIds[index] = i;
                index++;
            }
        }
    }
    
    // Function to get all users who prebooked for a particular station
    function getStationPrebookings(uint256 stationId) 
        external 
        view 
        returns (
            address[] memory users,
            uint256[] memory watts,
            uint256[] memory powers,
            uint256[] memory bookingIds,
            uint256[] memory timestamps
        ) 
    {
        // First, count how many prebookings exist for this station
        uint256 stationPrebookingCount = 0;
        for (uint256 i = 0; i < bookingCount; i++) {
            if (bookings[i].exists && bookings[i].stationId == stationId && bookings[i].pricePaid == 0) {
                stationPrebookingCount++;
            }
        }
        
        // Initialize arrays
        users = new address[](stationPrebookingCount);
        watts = new uint256[](stationPrebookingCount);
        powers = new uint256[](stationPrebookingCount);
        bookingIds = new uint256[](stationPrebookingCount);
        timestamps = new uint256[](stationPrebookingCount);
        
        // Populate arrays
        uint256 index = 0;
        for (uint256 i = 0; i < bookingCount; i++) {
            if (bookings[i].exists && bookings[i].stationId == stationId && bookings[i].pricePaid == 0) {
                users[index] = bookings[i].user;
                watts[index] = bookings[i].watt;
                powers[index] = bookings[i].power;
                bookingIds[index] = i;
                timestamps[index] = bookings[i].timestamp;
                index++;
            }
        }
    }

    // Function that always reverts for testing failure cases
    function revertFunction() external pure {
        revert("This function always reverts");
    }

    // Helper function to convert uint to string
    function _uint2str(uint256 _i) internal pure returns (string memory) {
        if (_i == 0) {
            return "0";
        }
        uint256 j = _i;
        uint256 len;
        while (j != 0) {
            len++;
            j /= 10;
        }
        bytes memory bstr = new bytes(len);
        uint256 k = len;
        while (_i != 0) {
            k = k - 1;
            uint8 temp = (48 + uint8(_i - _i / 10 * 10));
            bytes1 b1 = bytes1(temp);
            bstr[k] = b1;
            _i /= 10;
        }
        return string(bstr);
    }
}