// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract ChargingStation {
    struct Station {
        string stationUniqueId;
        string stationURL;
        uint256 pricePerWatt;
        uint256 power;
        address owner; // Track individual station owner
        bool exists;
        string physicalAddress; // Physical address of the charging station
        int256 latitude; // Latitude in microdegrees (multiply by 1e6)
        int256 longitude; // Longitude in microdegrees (multiply by 1e6)
    }

    address public userWalletContract;
    mapping(uint256 => Station) public stations;
    uint256 public stationCount;

    event StationRegistered(
        uint256 indexed stationId,
        string stationUniqueId,
        string stationURL,
        uint256 pricePerWatt,
        uint256 power,
        string physicalAddress,
        int256 latitude,
        int256 longitude
    );

    event PowerUpdated(
        uint256 indexed stationId,
        uint256 oldPower,
        uint256 newPower,
        uint256 oldPrice,
        uint256 newPrice
    );

    event PriceUpdated(
        uint256 indexed stationId,
        uint256 oldPrice,
        uint256 newPrice
    );

    modifier onlyUserWallet() {
        require(
            msg.sender == userWalletContract,
            "Only UserWallet contract can execute this function"
        );
        _;
    }

    modifier stationExists(uint256 stationId) {
        require(stations[stationId].exists, "Charging station does not exist");
        _;
    }

    constructor(address _userWalletContract) {
        require(
            _userWalletContract != address(0),
            "Invalid UserWallet address"
        );
        userWalletContract = _userWalletContract;
    }

    function registerStation(
        string memory stationUniqueId,
        string memory stationURL,
        uint256 pricePerWatt,
        uint256 power,
        string memory physicalAddress,
        int256 latitude,
        int256 longitude
    ) external {
        require(bytes(stationUniqueId).length > 0, "Station ID cannot be empty");
        require(pricePerWatt > 0, "Price per watt must be greater than 0");
        require(power > 0, "Power must be greater than 0");
        require(bytes(physicalAddress).length > 0, "Physical address cannot be empty");
        require(latitude >= -90000000 && latitude <= 90000000, "Invalid latitude");
        require(longitude >= -180000000 && longitude <= 180000000, "Invalid longitude");

        stations[stationCount] = Station({
            stationUniqueId: stationUniqueId,
            stationURL: stationURL,
            pricePerWatt: pricePerWatt,
            power: power,
            owner: msg.sender, // Use msg.sender as the station owner
            exists: true,
            physicalAddress: physicalAddress,
            latitude: latitude,
            longitude: longitude
        });

        emit StationRegistered(
            stationCount,
            stationUniqueId,
            stationURL,
            pricePerWatt,
            power,
            physicalAddress,
            latitude,
            longitude
        );
        stationCount++;
    }
    
    modifier onlyStationOwner(uint256 stationId) {
        require(
            stations[stationId].owner == msg.sender || msg.sender == userWalletContract,
            "Only station owner or UserWallet can execute this function"
        );
        _;
    }

    function updatePower(
        uint256 stationId,
        uint256 newPower
    ) external onlyStationOwner(stationId) stationExists(stationId) {
        require(newPower > 0, "Power must be greater than 0");

        Station storage station = stations[stationId];
        uint256 oldPower = station.power;
        uint256 oldPrice = station.pricePerWatt;

        // When power increases, price per watt should also increase
        if (newPower > oldPower) {
            // Increase price proportionally to power increase
            uint256 powerIncrease = ((newPower - oldPower) * 100) / oldPower; // percentage increase
            uint256 priceIncrease = (oldPrice * powerIncrease) / 100;
            station.pricePerWatt = oldPrice + priceIncrease;
        }

        station.power = newPower;

        emit PowerUpdated(
            stationId,
            oldPower,
            newPower,
            oldPrice,
            station.pricePerWatt
        );
    }

    function updatePrice(
        uint256 stationId,
        uint256 newPricePerWatt
    ) external onlyStationOwner(stationId) stationExists(stationId) {
        require(newPricePerWatt > 0, "Price per watt must be greater than 0");

        Station storage station = stations[stationId];
        uint256 oldPrice = station.pricePerWatt;

        station.pricePerWatt = newPricePerWatt;

        emit PriceUpdated(stationId, oldPrice, newPricePerWatt);
    }

    function getStation(
        uint256 stationId
    )
        external
        view
        stationExists(stationId)
        returns (
            string memory stationUniqueId,
            string memory stationURL,
            uint256 pricePerWatt,
            uint256 power,
            address owner,
            string memory physicalAddress,
            int256 latitude,
            int256 longitude
        )
    {
        Station memory station = stations[stationId];
        return (
            station.stationUniqueId,
            station.stationURL,
            station.pricePerWatt,
            station.power,
            station.owner,
            station.physicalAddress,
            station.latitude,
            station.longitude
        );
    }

    function getAllStations()
        external
        view
        returns (
            uint256[] memory stationIds,
            string[] memory stationUniqueIds,
            string[] memory stationURLs,
            uint256[] memory pricesPerWatt,
            uint256[] memory powers,
            address[] memory owners,
            string[] memory physicalAddresses,
            int256[] memory latitudes,
            int256[] memory longitudes
        )
    {
        uint256 activeStationCount = 0;

        // Count active stations
        for (uint256 i = 0; i < stationCount; i++) {
            if (stations[i].exists) {
                activeStationCount++;
            }
        }

        // Initialize arrays
        stationIds = new uint256[](activeStationCount);
        stationUniqueIds = new string[](activeStationCount);
        stationURLs = new string[](activeStationCount);
        pricesPerWatt = new uint256[](activeStationCount);
        powers = new uint256[](activeStationCount);
        owners = new address[](activeStationCount);
        physicalAddresses = new string[](activeStationCount);
        latitudes = new int256[](activeStationCount);
        longitudes = new int256[](activeStationCount);

        // Populate arrays
        uint256 index = 0;
        for (uint256 i = 0; i < stationCount; i++) {
            if (stations[i].exists) {
                stationIds[index] = i;
                stationUniqueIds[index] = stations[i].stationUniqueId;
                stationURLs[index] = stations[i].stationURL;
                pricesPerWatt[index] = stations[i].pricePerWatt;
                powers[index] = stations[i].power;
                owners[index] = stations[i].owner;
                physicalAddresses[index] = stations[i].physicalAddress;
                latitudes[index] = stations[i].latitude;
                longitudes[index] = stations[i].longitude;
                index++;
            }
        }
    }

    function getStationPrice(
        uint256 stationId
    ) external view stationExists(stationId) returns (uint256) {
        return stations[stationId].pricePerWatt;
    }

    function getStationPower(
        uint256 stationId
    ) external view stationExists(stationId) returns (uint256) {
        return stations[stationId].power;
    }

    function getStationOwner(
        uint256 stationId
    ) external view stationExists(stationId) returns (address) {
        return stations[stationId].owner;
    }

    function getStationLocation(
        uint256 stationId
    ) external view stationExists(stationId) returns (
        string memory physicalAddress,
        int256 latitude,
        int256 longitude
    ) {
        Station memory station = stations[stationId];
        return (station.physicalAddress, station.latitude, station.longitude);
    }

    function getStationURL(
        uint256 stationId
    ) external view stationExists(stationId) returns (string memory) {
        return stations[stationId].stationURL;
    }
}