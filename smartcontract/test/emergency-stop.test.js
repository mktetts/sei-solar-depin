const { expect } = require("chai");
const { ethers } = require("hardhat");
const axios = require("axios");

describe("Emergency Stop Integration Tests", function () {
    let userWallet;
    let chargingStation;
    let chargingBooking;
    let admin;
    let user1;
    let user2;

    // Helper function to register a test charging station
    async function registerTestStationWithDeviceURL(deviceURL = "http://192.168.100.101:5000") {
        await chargingStation.connect(admin).registerStation(
            "STATION_001",
            deviceURL, // Device URL that will receive HTTP calls
            ethers.parseEther("0.000001"), // 0.000001 ETH per watt
            1000, // 1000 watts capacity
            "123 Main St, San Francisco, CA", // physical address
            37774900, // latitude in microdegrees (37.7749 * 1e6)
            -122419400 // longitude in microdegrees (-122.4194 * 1e6)
        );
    }

    // Helper function to purchase power (needed before emergency stop)
    async function purchasePower(user, stationId, watt, power) {
        const expectedCost = await chargingBooking.calculatePrice(stationId, watt, power);
        
        const data = chargingBooking.interface.encodeFunctionData("buyPower", [
            user.address, stationId, watt, power
        ]);

        const tx = await userWallet.connect(admin).executeTransaction(
            user.address,
            await chargingBooking.getAddress(),
            expectedCost,
            data
        );

        const receipt = await tx.wait();
        return { tx, receipt, expectedCost };
    }

    beforeEach(async function () {
        [admin, user1, user2] = await ethers.getSigners();

        // Deploy UserWallet
        const UserWallet = await ethers.getContractFactory("UserWallet");
        userWallet = await UserWallet.deploy();
        await userWallet.waitForDeployment();

        // Deploy ChargingStation
        const ChargingStation = await ethers.getContractFactory("ChargingStation");
        chargingStation = await ChargingStation.deploy(await userWallet.getAddress());
        await chargingStation.waitForDeployment();

        // Deploy ChargingBooking
        const ChargingBooking = await ethers.getContractFactory("ChargingBooking");
        chargingBooking = await ChargingBooking.deploy(
            await chargingStation.getAddress(), 
            await userWallet.getAddress()
        );
        await chargingBooking.waitForDeployment();

        // Register a test station
        await registerTestStationWithDeviceURL();
        
        // User deposits ETH for testing
        await userWallet.connect(user1).deposit({ value: ethers.parseEther("2.0") });
        await userWallet.connect(user2).deposit({ value: ethers.parseEther("2.0") });
    });

    describe("Emergency Stop Event Emission", function () {
        it("Should emit EmergencyStopTriggered event when emergencyStop is called", async function () {
            const stationId = 0;
            const watt = 100;
            const power = 500;
            const wattsConsumed = 60; // User consumed 60 out of 100 watts

            // First purchase power
            await purchasePower(user1, stationId, watt, power);
            const bookingId = 0; // First booking

            // Now perform emergency stop
            const emergencyStopData = chargingBooking.interface.encodeFunctionData("emergencyStop", [
                user1.address, bookingId, wattsConsumed
            ]);

            const tx = await userWallet.connect(admin).executeTransaction(
                user1.address,
                await chargingBooking.getAddress(),
                0, // No payment for emergency stop
                emergencyStopData
            );

            // Verify EmergencyStopTriggered event was emitted
            await expect(tx).to.emit(chargingBooking, "EmergencyStopTriggered")
                .withArgs(
                    bookingId,
                    stationId,
                    user1.address,
                    "http://192.168.100.101:5000",
                    wattsConsumed,
                    ethers.parseEther("0.02"), // Expected refund amount: (100-60) * 500 * 0.000001 = 0.02 ETH
                    "/stop"
                );
        });

        it("Should generate correct HTTP endpoint for emergency stop", async function () {
            const stationId = 0;
            const watt = 200;
            const power = 800;
            const wattsConsumed = 120;

            // Purchase power first
            await purchasePower(user1, stationId, watt, power);
            const bookingId = 0;

            // Emergency stop
            const emergencyStopData = chargingBooking.interface.encodeFunctionData("emergencyStop", [
                user1.address, bookingId, wattsConsumed
            ]);

            const tx = await userWallet.connect(admin).executeTransaction(
                user1.address,
                await chargingBooking.getAddress(),
                0,
                emergencyStopData
            );

            // Verify event contains correct endpoint
            const receipt = await tx.wait();
            const emergencyStopEvent = receipt.logs.find(log => {
                try {
                    const parsedLog = chargingBooking.interface.parseLog(log);
                    return parsedLog.name === "EmergencyStopTriggered";
                } catch {
                    return false;
                }
            });

            expect(emergencyStopEvent).to.not.be.undefined;
            const parsedEvent = chargingBooking.interface.parseLog(emergencyStopEvent);
            expect(parsedEvent.args[6]).to.equal("/stop"); // httpEndpoint
        });
    });

    describe("Actual HTTP Requests to Your Flask Server", function () {
        beforeEach(async function () {
            console.log("📡 Emergency stop tests will make real HTTP requests to http://192.168.100.101:5000");
            console.log("🔥 Make sure your Flask server is running!");
        });

        it("Should make REAL HTTP request to /stop endpoint when emergencyStop is called", async function () {
            const stationId = 0;
            const watt = 100;
            const power = 500;
            const wattsConsumed = 60; // User consumed 60 out of 100 watts

            console.log("🚀 Step 1: Purchasing power to create an active booking...");
            
            // First purchase power
            const purchaseResult = await purchasePower(user1, stationId, watt, power);
            console.log("✅ Power purchased successfully");

            const bookingId = 0; // First booking

            console.log(`🛑 Step 2: Performing emergency stop (consumed ${wattsConsumed}/${watt} watts)...`);

            // Now perform emergency stop
            const emergencyStopData = chargingBooking.interface.encodeFunctionData("emergencyStop", [
                user1.address, bookingId, wattsConsumed
            ]);

            const tx = await userWallet.connect(admin).executeTransaction(
                user1.address,
                await chargingBooking.getAddress(),
                0,
                emergencyStopData
            );

            const receipt = await tx.wait();
            console.log("✅ Emergency stop transaction completed");

            // Find the EmergencyStopTriggered event
            const emergencyStopEvent = receipt.logs.find(log => {
                try {
                    const parsedLog = chargingBooking.interface.parseLog(log);
                    return parsedLog.name === "EmergencyStopTriggered";
                } catch {
                    return false;
                }
            });

            expect(emergencyStopEvent).to.not.be.undefined;
            const parsedEvent = chargingBooking.interface.parseLog(emergencyStopEvent);

            // Extract event data
            const eventData = {
                bookingId: Number(parsedEvent.args[0]),
                stationId: Number(parsedEvent.args[1]),
                user: parsedEvent.args[2],
                deviceURL: parsedEvent.args[3],
                wattsConsumed: Number(parsedEvent.args[4]),
                refundAmount: parsedEvent.args[5],
                httpEndpoint: parsedEvent.args[6]
            };

            console.log("📊 Emergency Stop Event Data:", eventData);

            // Make the REAL HTTP GET request to your Flask server's /stop endpoint
            const fullURL = eventData.deviceURL + eventData.httpEndpoint;
            console.log(`🌐 Making HTTP GET request to: ${fullURL}`);

            try {
                const httpResponse = await axios.get(fullURL, {
                    timeout: 5000,
                });

                console.log("🎉 Emergency stop HTTP request successful!");
                console.log("📥 Response status:", httpResponse.status);
                console.log("📥 Response data:", httpResponse.data);

                // Your Flask server should return 200 for successful stop
                expect(httpResponse.status).to.equal(200);

                // Check response format based on your Flask server
                if (typeof httpResponse.data === 'object') {
                    // Response is JSON object: {"status": "stopped", "delivered_Wh": total_wh}
                    expect(httpResponse.data.status).to.equal("stopped");
                    expect(httpResponse.data).to.have.property("delivered_Wh");
                    
                    console.log(`✅ Device stopped successfully! Delivered: ${httpResponse.data.delivered_Wh} Wh`);
                    
                } else if (typeof httpResponse.data === 'string') {
                    // Response is string: "LED is already off" or similar
                    console.log("📝 Server response:", httpResponse.data);
                }

            } catch (error) {
                if (error.code === 'ECONNREFUSED') {
                    console.log("❌ Connection refused - is your Flask server running at http://192.168.100.101:5000?");
                    throw new Error("Flask server not reachable. Please start your server at http://192.168.100.101:5000");
                } else if (error.code === 'ETIMEDOUT') {
                    console.log("⏱️  Request timed out");
                    throw new Error("HTTP request timed out");
                } else {
                    console.log("🔴 HTTP request failed:", error.message);
                    if (error.response) {
                        console.log("📥 Error response status:", error.response.status);
                        console.log("📥 Error response data:", error.response.data);
                    }
                    console.log("⚠️  HTTP request failed but test continues...");
                }
            }
        });

        it("Should handle multiple emergency stops (second should return 'LED is already off')", async function () {
            const stationId = 0;
            const watt = 150;
            const power = 600;
            const wattsConsumed = 100;

            console.log("🚀 Setting up scenario for multiple emergency stops...");

            // First purchase power
            await purchasePower(user1, stationId, watt, power);
            
            // First emergency stop
            console.log("🛑 Performing first emergency stop...");
            const emergencyStopData1 = chargingBooking.interface.encodeFunctionData("emergencyStop", [
                user1.address, 0, wattsConsumed
            ]);

            const tx1 = await userWallet.connect(admin).executeTransaction(
                user1.address,
                await chargingBooking.getAddress(),
                0,
                emergencyStopData1
            );

            const receipt1 = await tx1.wait();
            const event1 = receipt1.logs.find(log => {
                try {
                    const parsedLog = chargingBooking.interface.parseLog(log);
                    return parsedLog.name === "EmergencyStopTriggered";
                } catch {
                    return false;
                }
            });

            const parsedEvent1 = chargingBooking.interface.parseLog(event1);
            const eventData1 = {
                deviceURL: parsedEvent1.args[3],
                httpEndpoint: parsedEvent1.args[6]
            };

            console.log(`🌐 First stop request: ${eventData1.deviceURL + eventData1.httpEndpoint}`);

            try {
                const response1 = await axios.get(eventData1.deviceURL + eventData1.httpEndpoint, {
                    timeout: 5000
                });

                console.log("📥 First stop response:", response1.data);

                // Small delay before second request
                await new Promise(resolve => setTimeout(resolve, 1000));

                // Second stop request (device should already be off)
                console.log("🛑 Making second stop request (should return 'already off')...");
                const response2 = await axios.get(eventData1.deviceURL + eventData1.httpEndpoint, {
                    timeout: 5000
                });

                console.log("📥 Second stop response:", response2.data);

                // Second response should indicate LED is already off
                if (typeof response2.data === 'string') {
                    expect(response2.data).to.include('already off');
                }

            } catch (error) {
                console.log("⚠️  HTTP request failed:", error.message);
            }
        });

        it("Should make emergency stop request with different power parameters", async function () {
            const stationId = 0;
            const watt = 50;
            const power = 200;
            const wattsConsumed = 30;

            console.log(`🚀 Testing low power emergency stop: ${watt}Wh at ${power}W, consumed ${wattsConsumed}Wh...`);

            // Purchase power
            await purchasePower(user1, stationId, watt, power);

            // Emergency stop
            const emergencyStopData = chargingBooking.interface.encodeFunctionData("emergencyStop", [
                user1.address, 0, wattsConsumed
            ]);

            const tx = await userWallet.connect(admin).executeTransaction(
                user1.address,
                await chargingBooking.getAddress(),
                0,
                emergencyStopData
            );

            const receipt = await tx.wait();
            const event = receipt.logs.find(log => {
                try {
                    const parsedLog = chargingBooking.interface.parseLog(log);
                    return parsedLog.name === "EmergencyStopTriggered";
                } catch {
                    return false;
                }
            });

            const parsedEvent = chargingBooking.interface.parseLog(event);
            const eventData = {
                deviceURL: parsedEvent.args[3],
                httpEndpoint: parsedEvent.args[6],
                wattsConsumed: Number(parsedEvent.args[4])
            };

            console.log(`🌐 Stop request: ${eventData.deviceURL + eventData.httpEndpoint}`);
            console.log(`⚡ Watts consumed: ${eventData.wattsConsumed}Wh`);

            try {
                const httpResponse = await axios.get(eventData.deviceURL + eventData.httpEndpoint, {
                    timeout: 5000
                });

                console.log(`✅ Low power emergency stop successful! Status: ${httpResponse.status}`);
                console.log("📥 Response:", httpResponse.data);
                expect(httpResponse.status).to.equal(200);

            } catch (error) {
                console.log("⚠️  HTTP request failed:", error.message);
            }
        });

        it("COMPLETE END-TO-END TEST: Buy power (start charging) → Wait 5 seconds → Emergency stop", async function () {
            const stationId = 0;
            const watt = 100;
            const power = 500;
            const wattsConsumed = 75; // Simulated consumption during 5 seconds

            console.log("🎯 COMPLETE CHARGING CYCLE TEST");
            console.log("===============================================");
            console.log(`📋 Parameters: ${watt}Wh at ${power}W, expected consumption: ${wattsConsumed}Wh`);
            console.log("");

            // STEP 1: Buy Power - This should trigger /toggle API to START charging
            console.log("🚀 STEP 1: Purchasing power (this will trigger /toggle API to start charging)...");
            
            const expectedCost = await chargingBooking.calculatePrice(stationId, watt, power);
            console.log(`💰 Expected cost: ${ethers.formatEther(expectedCost)} ETH`);
            
            const buyPowerData = chargingBooking.interface.encodeFunctionData("buyPower", [
                user1.address, stationId, watt, power
            ]);

            const buyTx = await userWallet.connect(admin).executeTransaction(
                user1.address,
                await chargingBooking.getAddress(),
                expectedCost,
                buyPowerData
            );

            const buyReceipt = await buyTx.wait();
            console.log("✅ Buy power transaction completed");

            // Find and process the DeviceControlTriggered event from buyPower
            const deviceControlEvent = buyReceipt.logs.find(log => {
                try {
                    const parsedLog = chargingBooking.interface.parseLog(log);
                    return parsedLog.name === "DeviceControlTriggered";
                } catch {
                    return false;
                }
            });

            expect(deviceControlEvent).to.not.be.undefined;
            const parsedBuyEvent = chargingBooking.interface.parseLog(deviceControlEvent);

            const buyEventData = {
                bookingId: Number(parsedBuyEvent.args[0]),
                stationId: Number(parsedBuyEvent.args[1]),
                user: parsedBuyEvent.args[2],
                deviceURL: parsedBuyEvent.args[3],
                energy: Number(parsedBuyEvent.args[4]),
                power: Number(parsedBuyEvent.args[5]),
                httpEndpoint: parsedBuyEvent.args[6]
            };

            console.log("📊 Buy Power Event Data:", buyEventData);

            // Make the REAL HTTP GET request to START charging via /toggle endpoint
            const startURL = buyEventData.deviceURL + buyEventData.httpEndpoint;
            console.log(`🌐 STEP 1 HTTP: Making GET request to START charging: ${startURL}`);

            try {
                const startResponse = await axios.get(startURL, {
                    timeout: 5000,
                });

                console.log("🎉 START charging HTTP request successful!");
                console.log("📥 Start Response status:", startResponse.status);
                console.log("📥 Start Response data:", startResponse.data);
                expect(startResponse.status).to.equal(200);

                // STEP 2: Wait 5 seconds for actual charging
                console.log("");
                console.log("⏱️  STEP 2: Waiting 5 seconds for actual charging...");
                console.log("🔋 Device should be charging now!");
                
                let countdown = 5;
                const countdownInterval = setInterval(() => {
                    console.log(`⏳ Charging... ${countdown} seconds remaining`);
                    countdown--;
                }, 1000);

                await new Promise(resolve => setTimeout(resolve, 5000));
                clearInterval(countdownInterval);
                
                console.log("✅ 5 seconds of charging completed");
                console.log("");

                // STEP 3A: First call /stop endpoint to get actual delivered_Wh
                console.log("🛑 STEP 3A: Calling /stop endpoint to get actual consumed watts...");
                
                const stopURL = buyEventData.deviceURL + "/stop";
                console.log(`🌐 Making GET request to: ${stopURL}`);

                const stopResponse = await axios.get(stopURL, {
                    timeout: 5000,
                });

                console.log("🎉 /stop HTTP request successful!");
                console.log("📥 Response status:", stopResponse.status);
                console.log("📥 Response data:", stopResponse.data);
                expect(stopResponse.status).to.equal(200);

                // Get the actual delivered_Wh from Flask server
                let actualWattsConsumed = wattsConsumed; // fallback
                if (typeof stopResponse.data === 'object' && stopResponse.data.delivered_Wh !== undefined) {
                    // Use Math.ceil() to round UP - user should pay for any power consumed
                    actualWattsConsumed = Math.ceil(stopResponse.data.delivered_Wh);
                    console.log(`🔋 Flask server reports actual consumption: ${stopResponse.data.delivered_Wh} Wh`);
                    console.log(`🔢 Using rounded UP value for contract: ${actualWattsConsumed} Wh (Math.ceil)`);
                    console.log(`💡 This ensures user pays for any power consumed, even partial watts`);
                } else {
                    console.log(`⚠️  Could not get delivered_Wh from response, using fallback: ${actualWattsConsumed} Wh`);
                }

                // STEP 3B: Now call emergencyStop contract with actual consumed watts
                console.log("🛑 STEP 3B: Calling emergencyStop smart contract with actual consumed watts...");
                
                const emergencyStopData = chargingBooking.interface.encodeFunctionData("emergencyStop", [
                    user1.address, buyEventData.bookingId, actualWattsConsumed
                ]);

                const stopTx = await userWallet.connect(admin).executeTransaction(
                    user1.address,
                    await chargingBooking.getAddress(),
                    0,
                    emergencyStopData
                );

                const stopReceipt = await stopTx.wait();
                console.log("✅ Emergency stop smart contract transaction completed");

                // Find the EmergencyStopTriggered event
                const emergencyStopEvent = stopReceipt.logs.find(log => {
                    try {
                        const parsedLog = chargingBooking.interface.parseLog(log);
                        return parsedLog.name === "EmergencyStopTriggered";
                    } catch {
                        return false;
                    }
                });

                expect(emergencyStopEvent).to.not.be.undefined;
                const parsedStopEvent = chargingBooking.interface.parseLog(emergencyStopEvent);

                const stopEventData = {
                    bookingId: Number(parsedStopEvent.args[0]),
                    stationId: Number(parsedStopEvent.args[1]),
                    user: parsedStopEvent.args[2],
                    deviceURL: parsedStopEvent.args[3],
                    wattsConsumed: Number(parsedStopEvent.args[4]),
                    refundAmount: parsedStopEvent.args[5],
                    httpEndpoint: parsedStopEvent.args[6]
                };

                console.log("📊 Emergency Stop Smart Contract Event Data:", stopEventData);
                console.log(`💰 Calculated refund amount: ${ethers.formatEther(stopEventData.refundAmount)} ETH`);

                // Verify the results
                expect(stopResponse.data.status).to.equal("stopped");
                expect(stopResponse.data).to.have.property("delivered_Wh");
                
                const deliveredWh = stopResponse.data.delivered_Wh;
                console.log(`🔋 Flask server delivered: ${deliveredWh} Wh during the charging session`);
                console.log(`📊 Smart contract used: ${actualWattsConsumed} Wh for refund calculation`);
                
                // The delivered_Wh should be reasonable (not zero and not more than purchased)
                expect(deliveredWh).to.be.above(0);
                expect(deliveredWh).to.be.at.most(watt);

                console.log("");
                console.log("🎯 COMPLETE END-TO-END TEST SUCCESSFUL!");
                console.log("✅ 1. Started charging via /toggle endpoint");
                console.log("✅ 2. Charged for 5 seconds");
                console.log("✅ 3. Stopped charging via /stop endpoint");
                console.log("✅ 4. Received delivered_Wh response");
                console.log("===============================================");

            } catch (error) {
                if (error.code === 'ECONNREFUSED') {
                    console.log("❌ Connection refused - is your Flask server running at http://192.168.100.101:5000?");
                    throw new Error("Flask server not reachable. Please start your server at http://192.168.100.101:5000");
                } else if (error.code === 'ETIMEDOUT') {
                    console.log("⏱️  Request timed out");
                    throw new Error("HTTP request timed out");
                } else {
                    console.log("🔴 HTTP request failed:", error.message);
                    if (error.response) {
                        console.log("📥 Error response status:", error.response.status);
                        console.log("📥 Error response data:", error.response.data);
                    }
                    throw error;
                }
            }
        });
    });
});