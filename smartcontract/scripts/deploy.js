const { time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const hre = require("hardhat");
const fs = require("fs");
require('dotenv').config({ quiet: true });

async function main() {
    const networkName = hre.network.name;
    const networkConfig = hre.config.networks[networkName];
    const chainId = networkConfig.chainId || 31337; // Default to hardhat local chain ID

    console.log(`Deploying contracts to ${networkName} network (Chain ID: ${chainId})`);

    // Get the deployer account
    const [deployer] = await hre.ethers.getSigners();
    console.log("Deploying contracts with account:", deployer.address);
    console.log("Account balance:", (await hre.ethers.provider.getBalance(deployer.address)).toString());

    // Deploy UserWallet contract
    console.log("\n1. Deploying UserWallet contract...");
    const UserWallet = await hre.ethers.getContractFactory("UserWallet");
    const userWallet = await UserWallet.deploy();
    await userWallet.waitForDeployment();
    console.log("UserWallet deployed to:", await userWallet.getAddress());
    moveContractFiles(userWallet, "UserWallet", chainId);

    // Deploy ChargingStation contract
    console.log("\n2. Deploying ChargingStation contract...");
    const ChargingStation = await hre.ethers.getContractFactory("ChargingStation");
    const chargingStation = await ChargingStation.deploy(await userWallet.getAddress());
    await chargingStation.waitForDeployment();
    console.log("ChargingStation deployed to:", await chargingStation.getAddress());
    moveContractFiles(chargingStation, "ChargingStation", chainId);

    // Deploy ChargingBooking contract
    console.log("\n3. Deploying ChargingBooking contract...");
    const ChargingBooking = await hre.ethers.getContractFactory("ChargingBooking");
    const chargingBooking = await ChargingBooking.deploy(
        await chargingStation.getAddress(),
        await userWallet.getAddress()
    );
    await chargingBooking.waitForDeployment();
    console.log("ChargingBooking deployed to:", await chargingBooking.getAddress());
    moveContractFiles(chargingBooking, "ChargingBooking", chainId);

    // Create a combined deployment info file
    const deploymentInfo = {
        network: networkName,
        chainId: chainId,
        deployer: deployer.address,
        timestamp: new Date().toISOString(),
        contracts: {
            UserWallet: await userWallet.getAddress(),
            ChargingStation: await chargingStation.getAddress(),
            ChargingBooking: await chargingBooking.getAddress()
        }
    };
    
    console.log("\n📋 Deployment Summary:");
    console.log("UserWallet:", await userWallet.getAddress());
    console.log("ChargingStation:", await chargingStation.getAddress());
    console.log("ChargingBooking:", await chargingBooking.getAddress());
    // Optional: Register a sample device for testing
    // if (networkName === "hardhat" || networkName === "testnet") {
    //     console.log("\n🧪 Setting up test data...");

    //     // Deposit some ETH for the deployer
    //     await userWallet.connect(deployer).deposit({ value: hre.ethers.parseEther("1.0") });
    //     console.log("Deposited 1 ETH to UserWallet for deployer");

    //     // Register a sample charging station directly
    //     await chargingStation.connect(deployer).registerStation(
    //         "STATION_TEST_001",
    //         "http://192.168.100.101:5000",
    //         hre.ethers.parseEther("0.000001"), // 0.000001 ETH per watt
    //         1000, // 1000 watts capacity
    //         "123 Test Street, San Francisco, CA", // physical address
    //         37774900, // latitude in microdegrees (37.7749 * 1e6)
    //         -122419400 // longitude in microdegrees (-122.4194 * 1e6)
    //     );
    //     console.log("Registered sample EV charging station: STATION_TEST_001");
    // }
}

function moveContractFiles(contract, name, chainId) {
    const backendDir = "../mcp-server/contracts/";
    if (!fs.existsSync(backendDir)) {
        fs.mkdirSync(backendDir, { recursive: true });
    }
    fs.writeFileSync(
        backendDir + `${name}_address.json`,
        JSON.stringify({ address: contract.target }, undefined, 2)
    );
    let contractArtifact = artifacts.readArtifactSync(name);
    fs.writeFileSync(
        backendDir + `${name}_contract.json`,
        JSON.stringify(contractArtifact.abi, null, 2)
    );

    const frontendDir = "../ui/src/contracts/";
    if (!fs.existsSync(frontendDir)) {
        fs.mkdirSync(frontendDir, { recursive: true });
    }
    fs.writeFileSync(
        frontendDir + `${name}_address.json`,
        JSON.stringify({ address: contract.target }, undefined, 2)
    );
    contractArtifact = artifacts.readArtifactSync(name);
    fs.writeFileSync(
        frontendDir + `${name}_contract.json`,
        JSON.stringify(contractArtifact.abi, null, 2)
    );

}

main().catch((error) => {
    console.error("❌ Deployment failed:", error);
    process.exitCode = 1;
});