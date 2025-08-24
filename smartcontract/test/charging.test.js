const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("UserWallet with Charging Station Contracts", function () {
    let userWallet;
    let chargingStation;
    let chargingBooking;
    let admin;
    let user1;
    let user2;
    let nonAdmin;

    // Helper function to register a test charging station
    async function registerTestStation() {
        // Register a test charging station directly with admin's wallet
        await chargingStation.connect(admin).registerStation(
            "STATION_001",
            "https://metadata.example.com/station1",
            ethers.parseEther("0.000001"), // 0.000001 ETH per watt
            1000, // 1000 watts capacity
            "123 Main St, San Francisco, CA", // physical address
            37774900, // latitude in microdegrees (37.7749 * 1e6)
            -122419400 // longitude in microdegrees (-122.4194 * 1e6)
        );
    }

    beforeEach(async function () {
        [admin, user1, user2, nonAdmin] = await ethers.getSigners();

        const UserWallet = await ethers.getContractFactory("UserWallet");
        userWallet = await UserWallet.deploy();
        await userWallet.waitForDeployment();

        const ChargingStation = await ethers.getContractFactory("ChargingStation");
        chargingStation = await ChargingStation.deploy(await userWallet.getAddress());
        await chargingStation.waitForDeployment();

        const ChargingBooking = await ethers.getContractFactory("ChargingBooking");
        chargingBooking = await ChargingBooking.deploy(await chargingStation.getAddress(), await userWallet.getAddress());
        await chargingBooking.waitForDeployment();

    });

    describe("Deployment", function () {
        it("Should set the deployer as admin", async function () {
            expect(await userWallet.admin()).to.equal(admin.address);
        });

        it("Should have zero initial balances", async function () {
            expect(await userWallet.getUserBalance(user1.address)).to.equal(0);
            expect(await userWallet.getContractBalance()).to.equal(0);
        });
    });

    describe("Deposits", function () {
        it("Should allow users to deposit ETH", async function () {
            const depositAmount = ethers.parseEther("1.0");

            await expect(userWallet.connect(user1).deposit({ value: depositAmount }))
                .to.emit(userWallet, "Deposit")
                .withArgs(user1.address, depositAmount);

            expect(await userWallet.getUserBalance(user1.address)).to.equal(depositAmount);
            expect(await userWallet.getContractBalance()).to.equal(depositAmount);
        });

        it("Should reject zero deposits", async function () {
            await expect(userWallet.connect(user1).deposit({ value: 0 }))
                .to.be.revertedWith("Deposit amount must be greater than 0");
        });

        it("Should allow multiple deposits from same user", async function () {
            const firstDeposit = ethers.parseEther("1.0");
            const secondDeposit = ethers.parseEther("0.5");

            await userWallet.connect(user1).deposit({ value: firstDeposit });
            await userWallet.connect(user1).deposit({ value: secondDeposit });

            expect(await userWallet.getUserBalance(user1.address))
                .to.equal(firstDeposit + secondDeposit);
        });
    });

    describe("Withdrawals", function () {
        beforeEach(async function () {
            // Deposit some ETH for testing withdrawals
            await userWallet.connect(user1).deposit({ value: ethers.parseEther("2.0") });
        });

        it("Should allow users to withdraw their balance", async function () {
            const withdrawAmount = ethers.parseEther("1.0");
            const initialBalance = await ethers.provider.getBalance(user1.address);

            const tx = await userWallet.connect(user1).withdraw(withdrawAmount);
            const receipt = await tx.wait();
            const gasUsed = receipt.gasUsed * receipt.gasPrice;

            await expect(tx)
                .to.emit(userWallet, "Withdrawal")
                .withArgs(user1.address, withdrawAmount);

            expect(await userWallet.getUserBalance(user1.address))
                .to.equal(ethers.parseEther("1.0"));

            const finalBalance = await ethers.provider.getBalance(user1.address);
            expect(finalBalance).to.be.closeTo(
                initialBalance + withdrawAmount - gasUsed,
                ethers.parseEther("0.001") // Allow for small gas estimation differences
            );
        });

        it("Should reject withdrawal of more than balance", async function () {
            const withdrawAmount = ethers.parseEther("3.0");

            await expect(userWallet.connect(user1).withdraw(withdrawAmount))
                .to.be.revertedWith("Insufficient balance");
        });

        it("Should reject withdrawal from user with no balance", async function () {
            const withdrawAmount = ethers.parseEther("1.0");

            await expect(userWallet.connect(user2).withdraw(withdrawAmount))
                .to.be.revertedWith("Insufficient balance");
        });
    });

    describe("Admin Transaction Execution", function () {
        beforeEach(async function () {
            // Register test station first
            await registerTestStation();
            // Deposit ETH for testing
            await userWallet.connect(user1).deposit({ value: ethers.parseEther("10.0") });
        });

        it("Should allow admin to execute power purchase on behalf of user", async function () {
            const stationId = 0;
            const watt = 100;
            const power = 500;
            const expectedCost = await chargingBooking.calculatePrice(stationId, watt, power);

            // Encode function call for buying power
            const data = chargingBooking.interface.encodeFunctionData("buyPower", [user1.address, stationId, watt, power]);

            const initialUserBalance = await userWallet.getUserBalance(user1.address);
            const initialBookingCount = await chargingBooking.getBookingCount();

            const tx = await userWallet.connect(admin).executeTransaction(
                user1.address,
                await chargingBooking.getAddress(),
                expectedCost,
                data
            );

            await expect(tx).to.emit(userWallet, "TransactionExecuted");

            // Check that the booking was created
            const finalBookingCount = await chargingBooking.getBookingCount();
            expect(finalBookingCount).to.equal(initialBookingCount + 1n);

            // Check that user balance was reduced by transaction amount + gas
            const finalUserBalance = await userWallet.getUserBalance(user1.address);
            expect(finalUserBalance).to.be.lt(initialUserBalance - expectedCost);

            // Verify the booking details
            const booking = await chargingBooking.getBooking(initialBookingCount);
            expect(booking.user).to.equal(user1.address); // Should be the actual user, not the UserWallet contract
            expect(booking.stationId).to.equal(stationId);
            expect(booking.watt).to.equal(watt);
            expect(booking.power).to.equal(power);
            expect(booking.pricePaid).to.equal(expectedCost);
        });

        it("Should reject transaction execution by non-admin", async function () {
            const stationId = 0;
            const watt = 100;
            const power = 500;
            const expectedCost = await chargingBooking.calculatePrice(stationId, watt, power);
            const data = chargingBooking.interface.encodeFunctionData("buyPower", [user1.address, stationId, watt, power]);

            await expect(userWallet.connect(nonAdmin).executeTransaction(
                user1.address,
                await chargingBooking.getAddress(),
                expectedCost,
                data
            )).to.be.revertedWith("Only admin can execute this function");
        });

        it("Should reject transaction if user has insufficient balance", async function () {
            const transactionAmount = ethers.parseEther("15.0"); // More than deposited (user has 10 ETH)

            // Use a simple transfer to an address instead of a complex contract call
            const data = "0x"; // Empty data for simple transfer

            await expect(userWallet.connect(admin).executeTransaction(
                user1.address,
                user2.address, // Simple transfer to user2
                transactionAmount,
                data
            )).to.be.revertedWith("Insufficient balance");
        });

        it("Should reject transaction if target contract call fails", async function () {
            const transactionAmount = ethers.parseEther("1.0");
            const data = chargingBooking.interface.encodeFunctionData("revertFunction", []);

            await expect(userWallet.connect(admin).executeTransaction(
                user1.address,
                await chargingBooking.getAddress(),
                transactionAmount,
                data
            )).to.be.revertedWith("Transaction execution failed");
        });

        it("Should handle transaction with zero amount", async function () {
            const transactionAmount = 0;
            const stationId = 0;
            const watt = 100;
            const power = 500;
            const data = chargingBooking.interface.encodeFunctionData("prebookCharging", [user1.address, stationId, watt, power]);

            const initialBookingCount = await chargingBooking.getBookingCount();

            await userWallet.connect(admin).executeTransaction(
                user1.address,
                await chargingBooking.getAddress(),
                transactionAmount,
                data
            );

            // Check that prebooking was created (no payment required)
            const finalBookingCount = await chargingBooking.getBookingCount();
            expect(finalBookingCount).to.equal(initialBookingCount + 1n);

            const booking = await chargingBooking.getBooking(initialBookingCount);
            expect(booking.pricePaid).to.equal(0); // Prebook doesn't require payment
        });

        it("Should properly calculate and deduct gas costs", async function () {
            const stationId = 0;
            const watt = 100;
            const power = 500;
            const expectedCost = await chargingBooking.calculatePrice(stationId, watt, power);
            const data = chargingBooking.interface.encodeFunctionData("buyPower", [user1.address, stationId, watt, power]);

            const initialUserBalance = await userWallet.getUserBalance(user1.address);
            const initialContractBalance = await userWallet.getContractBalance();

            const tx = await userWallet.connect(admin).executeTransaction(
                user1.address,
                await chargingBooking.getAddress(),
                expectedCost,
                data
            );

            const finalUserBalance = await userWallet.getUserBalance(user1.address);
            const finalContractBalance = await userWallet.getContractBalance();

            // User balance should be reduced by more than just the transaction amount (gas included)
            const totalDeducted = initialUserBalance - finalUserBalance;
            expect(totalDeducted).to.be.gt(expectedCost);

            // Contract balance should be reduced by the transaction amount plus gas reimbursement
            const contractBalanceReduction = initialContractBalance - finalContractBalance;
            expect(contractBalanceReduction).to.be.gt(expectedCost);

            // Verify the charging booking contract received the payment
            expect(await chargingBooking.getContractBalance()).to.equal(expectedCost);

            // Verify owner earnings were tracked
            expect(await chargingBooking.getOwnerEarnings(admin.address)).to.equal(expectedCost);
        });
    });

    describe("Admin Management", function () {
        it("Should allow admin to change admin address", async function () {
            await userWallet.connect(admin).changeAdmin(user1.address);
            expect(await userWallet.admin()).to.equal(user1.address);
        });

        it("Should reject admin change by non-admin", async function () {
            await expect(userWallet.connect(nonAdmin).changeAdmin(user1.address))
                .to.be.revertedWith("Only admin can execute this function");
        });

        it("Should reject setting admin to zero address", async function () {
            await expect(userWallet.connect(admin).changeAdmin(ethers.ZeroAddress))
                .to.be.revertedWith("New admin cannot be zero address");
        });
    });

    describe("View Functions", function () {
        it("Should return correct user balance", async function () {
            const depositAmount = ethers.parseEther("2.5");
            await userWallet.connect(user1).deposit({ value: depositAmount });

            expect(await userWallet.getUserBalance(user1.address)).to.equal(depositAmount);
            expect(await userWallet.getUserBalance(user2.address)).to.equal(0);
        });

        it("Should return correct contract balance", async function () {
            const deposit1 = ethers.parseEther("1.0");
            const deposit2 = ethers.parseEther("2.0");

            await userWallet.connect(user1).deposit({ value: deposit1 });
            await userWallet.connect(user2).deposit({ value: deposit2 });

            expect(await userWallet.getContractBalance()).to.equal(deposit1 + deposit2);
        });
    });

    describe("Edge Cases", function () {
        it("Should handle multiple users with different balances", async function () {
            await userWallet.connect(user1).deposit({ value: ethers.parseEther("1.0") });
            await userWallet.connect(user2).deposit({ value: ethers.parseEther("2.0") });

            expect(await userWallet.getUserBalance(user1.address)).to.equal(ethers.parseEther("1.0"));
            expect(await userWallet.getUserBalance(user2.address)).to.equal(ethers.parseEther("2.0"));
            expect(await userWallet.getContractBalance()).to.equal(ethers.parseEther("3.0"));
        });

        it("Should handle transaction execution for different users", async function () {
            // Register station for this specific test
            await registerTestStation();

            await userWallet.connect(user1).deposit({ value: ethers.parseEther("2.0") });
            await userWallet.connect(user2).deposit({ value: ethers.parseEther("3.0") });

            const stationId = 0;
            const watt = 50;
            const power = 200;
            const expectedCost = await chargingBooking.calculatePrice(stationId, watt, power);
            const data = chargingBooking.interface.encodeFunctionData("buyPower", [user1.address, stationId, watt, power]);

            // Execute transaction for user1
            await userWallet.connect(admin).executeTransaction(
                user1.address,
                await chargingBooking.getAddress(),
                expectedCost,
                data
            );

            // User1 balance should be reduced, user2 balance should remain the same
            expect(await userWallet.getUserBalance(user1.address)).to.be.lt(ethers.parseEther("2.0"));
            expect(await userWallet.getUserBalance(user2.address)).to.equal(ethers.parseEther("3.0"));
        });
    });


    describe("Charging Station Contract", function () {
        beforeEach(async function () {
            await registerTestStation();
        });

        it("Should register charging stations correctly", async function () {
            const station = await chargingStation.getStation(0);
            expect(station.stationUniqueId).to.equal("STATION_001");
            expect(station.stationURL).to.equal("https://metadata.example.com/station1");
            expect(station.pricePerWatt).to.equal(ethers.parseEther("0.000001"));
            expect(station.power).to.equal(1000);
            expect(station.owner).to.equal(admin.address);
            expect(station.physicalAddress).to.equal("123 Main St, San Francisco, CA");
            expect(station.latitude).to.equal(37774900);
            expect(station.longitude).to.equal(-122419400);
        });

        it("Should update power and increase price", async function () {
            const initialPrice = await chargingStation.getStationPrice(0);

            // Update power directly by station owner (admin)
            await chargingStation.connect(admin).updatePower(0, 1500);

            const newPrice = await chargingStation.getStationPrice(0);
            const newPower = await chargingStation.getStationPower(0);

            expect(newPower).to.equal(1500);
            expect(newPrice).to.be.gt(initialPrice);
        });

        it("Should allow station owner to update price", async function () {
            const initialPrice = await chargingStation.getStationPrice(0);
            const newPrice = ethers.parseEther("0.000002"); // Double the price

            // Update price directly by station owner (admin)
            const tx = await chargingStation.connect(admin).updatePrice(0, newPrice);

            await expect(tx).to.emit(chargingStation, "PriceUpdated").withArgs(0, initialPrice, newPrice);

            const finalPrice = await chargingStation.getStationPrice(0);
            expect(finalPrice).to.equal(newPrice);
        });

        it("Should return all charging stations", async function () {
            // Register another station directly with user2's wallet
            await chargingStation.connect(user2).registerStation(
                "STATION_002",
                "https://metadata.example.com/station2",
                ethers.parseEther("0.000002"),
                2000,
                "456 Oak Ave, Los Angeles, CA",
                34052200, // LA latitude
                -118243700 // LA longitude
            );

            const stations = await chargingStation.getAllStations();
            expect(stations.stationIds.length).to.equal(2);
            expect(stations.stationUniqueIds[0]).to.equal("STATION_001");
            expect(stations.stationUniqueIds[1]).to.equal("STATION_002");
            expect(stations.owners[0]).to.equal(admin.address);
            expect(stations.owners[1]).to.equal(user2.address);
            expect(stations.physicalAddresses[0]).to.equal("123 Main St, San Francisco, CA");
            expect(stations.physicalAddresses[1]).to.equal("456 Oak Ave, Los Angeles, CA");
        });

        it("Should get station location correctly", async function () {
            const location = await chargingStation.getStationLocation(0);
            expect(location.physicalAddress).to.equal("123 Main St, San Francisco, CA");
            expect(location.latitude).to.equal(37774900);
            expect(location.longitude).to.equal(-122419400);
        });
    });

    describe("Charging Booking Contract", function () {
        beforeEach(async function () {
            await registerTestStation();
        });

        it("Should calculate price correctly", async function () {
            const stationId = 0;
            const watt = 100n; // Use BigInt
            const power = 500n; // Use BigInt
            const pricePerWatt = await chargingStation.getStationPrice(stationId);
            const expectedPrice = watt * power * pricePerWatt;

            const calculatedPrice = await chargingBooking.calculatePrice(stationId, watt, power);
            expect(calculatedPrice).to.equal(expectedPrice);
        });

        it("Should allow prebooking without payment", async function () {
            const stationId = 0;
            const watt = 100;
            const power = 500;

            // User must deposit first
            await userWallet.connect(user1).deposit({ value: ethers.parseEther("1.0") });

            const data = chargingBooking.interface.encodeFunctionData("prebookCharging", [user1.address, stationId, watt, power]);
            const initialBookingCount = await chargingBooking.getBookingCount();

            await userWallet.connect(admin).executeTransaction(
                user1.address,
                await chargingBooking.getAddress(),
                0, // no payment for prebooking
                data
            );

            const booking = await chargingBooking.getBooking(initialBookingCount);
            expect(booking.user).to.equal(user1.address);
            expect(booking.pricePaid).to.equal(0);
        });

        it("Should allow buying power with payment", async function () {
            const stationId = 0;
            const watt = 100;
            const power = 500;
            const expectedCost = await chargingBooking.calculatePrice(stationId, watt, power);

            // User must deposit first
            await userWallet.connect(user1).deposit({ value: ethers.parseEther("1.0") });

            const data = chargingBooking.interface.encodeFunctionData("buyPower", [user1.address, stationId, watt, power]);
            const initialBookingCount = await chargingBooking.getBookingCount();

            await userWallet.connect(admin).executeTransaction(
                user1.address,
                await chargingBooking.getAddress(),
                expectedCost,
                data
            );

            const booking = await chargingBooking.getBooking(initialBookingCount);
            expect(booking.user).to.equal(user1.address);
            expect(booking.pricePaid).to.equal(expectedCost);
        });

        it("Should reject insufficient payment", async function () {
            const stationId = 0;
            const watt = 100;
            const power = 500;
            const expectedCost = await chargingBooking.calculatePrice(stationId, watt, power);
            const insufficientPayment = expectedCost - 1n;

            // User deposits insufficient amount
            await userWallet.connect(user1).deposit({ value: insufficientPayment });

            const data = chargingBooking.interface.encodeFunctionData("buyPower", [user1.address, stationId, watt, power]);

            await expect(userWallet.connect(admin).executeTransaction(
                user1.address,
                await chargingBooking.getAddress(),
                expectedCost,
                data
            )).to.be.revertedWith("Insufficient balance");
        });

        it("Should handle exact payment correctly", async function () {
            const stationId = 0;
            const watt = 100;
            const power = 500;
            const expectedCost = await chargingBooking.calculatePrice(stationId, watt, power);

            // User deposits exact amount needed plus some for gas
            await userWallet.connect(user1).deposit({ value: expectedCost + ethers.parseEther("0.1") });

            const initialUserBalance = await userWallet.getUserBalance(user1.address);
            const data = chargingBooking.interface.encodeFunctionData("buyPower", [user1.address, stationId, watt, power]);

            await userWallet.connect(admin).executeTransaction(
                user1.address,
                await chargingBooking.getAddress(),
                expectedCost,
                data
            );

            const finalUserBalance = await userWallet.getUserBalance(user1.address);
            expect(finalUserBalance).to.be.lt(initialUserBalance - expectedCost);
        });

        it("Should track owner earnings correctly", async function () {
            const stationId = 0;
            const watt = 100;
            const power = 500;
            const expectedCost = await chargingBooking.calculatePrice(stationId, watt, power);

            const initialEarnings = await chargingBooking.getOwnerEarnings(admin.address);

            // User must deposit and purchase through UserWallet
            await userWallet.connect(user1).deposit({ value: ethers.parseEther("1.0") });
            const data = chargingBooking.interface.encodeFunctionData("buyPower", [user1.address, stationId, watt, power]);

            await userWallet.connect(admin).executeTransaction(
                user1.address,
                await chargingBooking.getAddress(),
                expectedCost,
                data
            );

            const finalEarnings = await chargingBooking.getOwnerEarnings(admin.address);
            expect(finalEarnings).to.equal(initialEarnings + expectedCost);
        });

        it("Should allow owner to withdraw earnings directly", async function () {
            const stationId = 0;
            const watt = 100;
            const power = 500;
            const expectedCost = await chargingBooking.calculatePrice(stationId, watt, power);

            // User makes a purchase to generate earnings for station owner (admin)
            await userWallet.connect(user1).deposit({ value: ethers.parseEther("1.0") });
            const buyData = chargingBooking.interface.encodeFunctionData("buyPower", [user1.address, stationId, watt, power]);

            await userWallet.connect(admin).executeTransaction(
                user1.address,
                await chargingBooking.getAddress(),
                expectedCost,
                buyData
            );

            const initialAdminBalance = await ethers.provider.getBalance(admin.address);
            const earnings = await chargingBooking.getOwnerEarnings(admin.address);

            // Admin withdraws earnings directly from ChargingBooking
            const tx = await chargingBooking.connect(admin).withdrawEarnings();
            const receipt = await tx.wait();
            const gasUsed = receipt.gasUsed * receipt.gasPrice;

            await expect(tx).to.emit(chargingBooking, "EarningsWithdrawn").withArgs(admin.address, earnings);

            const finalAdminBalance = await ethers.provider.getBalance(admin.address);
            const finalEarnings = await chargingBooking.getOwnerEarnings(admin.address);

            expect(finalEarnings).to.equal(0);
            expect(finalAdminBalance).to.be.closeTo(
                initialAdminBalance + earnings - gasUsed,
                ethers.parseEther("0.001")
            );
        });

        it("Should reject withdrawal by users with no earnings", async function () {
            // user1 tries to withdraw earnings but has none
            await expect(chargingBooking.connect(user1).withdrawEarnings())
                .to.be.revertedWith("No earnings to withdraw");
        });

        it("Should reject withdrawal when no earnings", async function () {
            // Admin tries to withdraw but has no earnings yet
            await expect(chargingBooking.connect(admin).withdrawEarnings())
                .to.be.revertedWith("No earnings to withdraw");
        });

        it("Should show correct earnings with getMyEarnings", async function () {
            const stationId = 0;
            const watt = 100;
            const power = 500;
            const expectedCost = await chargingBooking.calculatePrice(stationId, watt, power);

            // Generate earnings through UserWallet
            await userWallet.connect(user1).deposit({ value: ethers.parseEther("1.0") });
            const buyData = chargingBooking.interface.encodeFunctionData("buyPower", [user1.address, stationId, watt, power]);

            await userWallet.connect(admin).executeTransaction(
                user1.address,
                await chargingBooking.getAddress(),
                expectedCost,
                buyData
            );

            const myEarnings = await chargingBooking.connect(admin).getMyEarnings();
            const ownerEarnings = await chargingBooking.getOwnerEarnings(admin.address);

            expect(myEarnings).to.equal(ownerEarnings);
            expect(myEarnings).to.equal(expectedCost);
        });

        it("Should return station bookings correctly", async function () {
            const stationId = 0;
            const watt1 = 100;
            const power1 = 500;
            const watt2 = 200;
            const power2 = 300;
            
            const expectedCost1 = await chargingBooking.calculatePrice(stationId, watt1, power1);
            const expectedCost2 = await chargingBooking.calculatePrice(stationId, watt2, power2);

            // User1 makes a purchase
            await userWallet.connect(user1).deposit({ value: ethers.parseEther("1.0") });
            const buyData1 = chargingBooking.interface.encodeFunctionData("buyPower", [user1.address, stationId, watt1, power1]);

            await userWallet.connect(admin).executeTransaction(
                user1.address,
                await chargingBooking.getAddress(),
                expectedCost1,
                buyData1
            );

            // User2 makes a purchase
            await userWallet.connect(user2).deposit({ value: ethers.parseEther("1.0") });
            const buyData2 = chargingBooking.interface.encodeFunctionData("buyPower", [user2.address, stationId, watt2, power2]);

            await userWallet.connect(admin).executeTransaction(
                user2.address,
                await chargingBooking.getAddress(),
                expectedCost2,
                buyData2
            );

            // Get station bookings
            const stationBookings = await chargingBooking.getStationBookings(stationId);
            
            expect(stationBookings.users.length).to.equal(2);
            expect(stationBookings.users[0]).to.equal(user1.address);
            expect(stationBookings.users[1]).to.equal(user2.address);
            expect(stationBookings.amountsPaid[0]).to.equal(expectedCost1);
            expect(stationBookings.amountsPaid[1]).to.equal(expectedCost2);
        });

        it("Should return station prebookings correctly", async function () {
            const stationId = 0;
            const watt1 = 150;
            const power1 = 400;
            const watt2 = 250;
            const power2 = 600;

            // User1 makes a prebooking
            await userWallet.connect(user1).deposit({ value: ethers.parseEther("1.0") });
            const prebookData1 = chargingBooking.interface.encodeFunctionData("prebookCharging", [user1.address, stationId, watt1, power1]);

            await userWallet.connect(admin).executeTransaction(
                user1.address,
                await chargingBooking.getAddress(),
                0, // no payment for prebooking
                prebookData1
            );

            // User2 makes a prebooking
            await userWallet.connect(user2).deposit({ value: ethers.parseEther("1.0") });
            const prebookData2 = chargingBooking.interface.encodeFunctionData("prebookCharging", [user2.address, stationId, watt2, power2]);

            await userWallet.connect(admin).executeTransaction(
                user2.address,
                await chargingBooking.getAddress(),
                0, // no payment for prebooking
                prebookData2
            );

            // Get station prebookings
            const stationPrebookings = await chargingBooking.getStationPrebookings(stationId);
            
            expect(stationPrebookings.users.length).to.equal(2);
            expect(stationPrebookings.users[0]).to.equal(user1.address);
            expect(stationPrebookings.users[1]).to.equal(user2.address);
            expect(stationPrebookings.watts[0]).to.equal(watt1);
            expect(stationPrebookings.watts[1]).to.equal(watt2);
            expect(stationPrebookings.powers[0]).to.equal(power1);
            expect(stationPrebookings.powers[1]).to.equal(power2);
            expect(stationPrebookings.timestamps[0]).to.be.gt(0);
            expect(stationPrebookings.timestamps[1]).to.be.gt(0);
        });

        it("Should allow emergency stop with partial watts consumption", async function () {
            const stationId = 0;
            const watt = 100;
            const power = 500;
            const wattsConsumed = 60; // User consumed 60 out of 100 watts
            const expectedCost = await chargingBooking.calculatePrice(stationId, watt, power);

            // User deposits and makes purchase
            await userWallet.connect(user1).deposit({ value: ethers.parseEther("1.0") });
            const buyData = chargingBooking.interface.encodeFunctionData("buyPower", [user1.address, stationId, watt, power]);

            const initialBookingCount = await chargingBooking.getBookingCount();

            await userWallet.connect(admin).executeTransaction(
                user1.address,
                await chargingBooking.getAddress(),
                expectedCost,
                buyData
            );

            const bookingId = initialBookingCount; // The booking ID is the previous count

            // Calculate expected refund (unused watts)
            const unusedWatts = BigInt(watt - wattsConsumed);
            const pricePerWatt = await chargingStation.getStationPrice(stationId);
            const expectedRefund = unusedWatts * BigInt(power) * pricePerWatt;

            const initialOwnerEarnings = await chargingBooking.getOwnerEarnings(admin.address);
            const initialUserBalance = await userWallet.getUserBalance(user1.address);

            // Emergency stop
            const emergencyStopData = chargingBooking.interface.encodeFunctionData("emergencyStop", [user1.address, bookingId, wattsConsumed]);

            const tx2 = await userWallet.connect(admin).executeTransaction(
                user1.address,
                await chargingBooking.getAddress(),
                0,
                emergencyStopData
            );

            await expect(tx2).to.emit(chargingBooking, "EmergencyStop").withArgs(bookingId, user1.address, wattsConsumed, expectedRefund);

            // Check booking status
            const booking = await chargingBooking.getBooking(bookingId);
            expect(booking.status).to.equal(2); // BookingStatus.STOPPED
            expect(booking.wattsConsumed).to.equal(wattsConsumed);
            expect(booking.refundAmount).to.equal(expectedRefund);

            // Check owner earnings reduced by refund
            const finalOwnerEarnings = await chargingBooking.getOwnerEarnings(admin.address);
            expect(finalOwnerEarnings).to.equal(initialOwnerEarnings - expectedRefund);

            // Note: User balance increase from refund would be handled by UserWallet contract
        });

        it("Should allow emergency stop with zero consumption", async function () {
            const stationId = 0;
            const watt = 100;
            const power = 500;
            const wattsConsumed = 0; // User consumed nothing
            const expectedCost = await chargingBooking.calculatePrice(stationId, watt, power);

            // User deposits and makes purchase
            await userWallet.connect(user1).deposit({ value: ethers.parseEther("1.0") });
            const buyData = chargingBooking.interface.encodeFunctionData("buyPower", [user1.address, stationId, watt, power]);

            const initialBookingCount = await chargingBooking.getBookingCount();

            await userWallet.connect(admin).executeTransaction(
                user1.address,
                await chargingBooking.getAddress(),
                expectedCost,
                buyData
            );

            const bookingId = initialBookingCount;

            // Expected refund should be the full amount
            const expectedRefund = expectedCost;

            // Emergency stop
            const emergencyStopData = chargingBooking.interface.encodeFunctionData("emergencyStop", [user1.address, bookingId, wattsConsumed]);

            await expect(userWallet.connect(admin).executeTransaction(
                user1.address,
                await chargingBooking.getAddress(),
                0,
                emergencyStopData
            )).to.emit(chargingBooking, "EmergencyStop").withArgs(bookingId, user1.address, wattsConsumed, expectedRefund);

            // Check booking status
            const booking = await chargingBooking.getBooking(bookingId);
            expect(booking.status).to.equal(2); // BookingStatus.STOPPED
            expect(booking.refundAmount).to.equal(expectedRefund);
        });

        it("Should allow emergency stop with full consumption (no refund)", async function () {
            const stationId = 0;
            const watt = 100;
            const power = 500;
            const wattsConsumed = 100; // User consumed all watts
            const expectedCost = await chargingBooking.calculatePrice(stationId, watt, power);

            // User deposits and makes purchase
            await userWallet.connect(user1).deposit({ value: ethers.parseEther("1.0") });
            const buyData = chargingBooking.interface.encodeFunctionData("buyPower", [user1.address, stationId, watt, power]);

            const initialBookingCount = await chargingBooking.getBookingCount();

            await userWallet.connect(admin).executeTransaction(
                user1.address,
                await chargingBooking.getAddress(),
                expectedCost,
                buyData
            );

            const bookingId = initialBookingCount;

            // Expected refund should be 0
            const expectedRefund = 0;

            // Emergency stop
            const emergencyStopData = chargingBooking.interface.encodeFunctionData("emergencyStop", [user1.address, bookingId, wattsConsumed]);

            await expect(userWallet.connect(admin).executeTransaction(
                user1.address,
                await chargingBooking.getAddress(),
                0,
                emergencyStopData
            )).to.emit(chargingBooking, "EmergencyStop").withArgs(bookingId, user1.address, wattsConsumed, expectedRefund);

            // Check booking status
            const booking = await chargingBooking.getBooking(bookingId);
            expect(booking.status).to.equal(2); // BookingStatus.STOPPED
            expect(booking.refundAmount).to.equal(expectedRefund);
        });

        it("Should reject emergency stop by non-owner", async function () {
            const stationId = 0;
            const watt = 100;
            const power = 500;
            const wattsConsumed = 60;
            const expectedCost = await chargingBooking.calculatePrice(stationId, watt, power);

            // User1 deposits and makes purchase
            await userWallet.connect(user1).deposit({ value: ethers.parseEther("1.0") });
            const buyData = chargingBooking.interface.encodeFunctionData("buyPower", [user1.address, stationId, watt, power]);

            const initialBookingCount = await chargingBooking.getBookingCount();

            await userWallet.connect(admin).executeTransaction(
                user1.address,
                await chargingBooking.getAddress(),
                expectedCost,
                buyData
            );

            const bookingId = initialBookingCount;

            // User2 tries to emergency stop user1's booking
            await userWallet.connect(user2).deposit({ value: ethers.parseEther("1.0") });
            const emergencyStopData = chargingBooking.interface.encodeFunctionData("emergencyStop", [user2.address, bookingId, wattsConsumed]);

            await expect(userWallet.connect(admin).executeTransaction(
                user2.address,
                await chargingBooking.getAddress(),
                0,
                emergencyStopData
            )).to.be.revertedWith("Transaction execution failed");
        });

        it("Should reject emergency stop on non-existent booking", async function () {
            const nonExistentBookingId = 9999;
            const wattsConsumed = 60;

            await userWallet.connect(user1).deposit({ value: ethers.parseEther("1.0") });
            const emergencyStopData = chargingBooking.interface.encodeFunctionData("emergencyStop", [user1.address, nonExistentBookingId, wattsConsumed]);

            await expect(userWallet.connect(admin).executeTransaction(
                user1.address,
                await chargingBooking.getAddress(),
                0,
                emergencyStopData
            )).to.be.revertedWith("Transaction execution failed");
        });

        it("Should reject emergency stop on prebookings", async function () {
            const stationId = 0;
            const watt = 100;
            const power = 500;
            const wattsConsumed = 60;

            // User makes prebooking
            await userWallet.connect(user1).deposit({ value: ethers.parseEther("1.0") });
            const prebookData = chargingBooking.interface.encodeFunctionData("prebookCharging", [user1.address, stationId, watt, power]);

            const initialBookingCount = await chargingBooking.getBookingCount();

            await userWallet.connect(admin).executeTransaction(
                user1.address,
                await chargingBooking.getAddress(),
                0,
                prebookData
            );

            const bookingId = initialBookingCount;

            // Try emergency stop on prebooking
            const emergencyStopData = chargingBooking.interface.encodeFunctionData("emergencyStop", [user1.address, bookingId, wattsConsumed]);

            await expect(userWallet.connect(admin).executeTransaction(
                user1.address,
                await chargingBooking.getAddress(),
                0,
                emergencyStopData
            )).to.be.revertedWith("Transaction execution failed");
        });

        it("Should reject emergency stop with watts consumed exceeding booked watts", async function () {
            const stationId = 0;
            const watt = 100;
            const power = 500;
            const wattsConsumed = 150; // More than booked
            const expectedCost = await chargingBooking.calculatePrice(stationId, watt, power);

            // User deposits and makes purchase
            await userWallet.connect(user1).deposit({ value: ethers.parseEther("1.0") });
            const buyData = chargingBooking.interface.encodeFunctionData("buyPower", [user1.address, stationId, watt, power]);

            const initialBookingCount = await chargingBooking.getBookingCount();

            await userWallet.connect(admin).executeTransaction(
                user1.address,
                await chargingBooking.getAddress(),
                expectedCost,
                buyData
            );

            const bookingId = initialBookingCount;

            // Try emergency stop with excessive consumption
            const emergencyStopData = chargingBooking.interface.encodeFunctionData("emergencyStop", [user1.address, bookingId, wattsConsumed]);

            await expect(userWallet.connect(admin).executeTransaction(
                user1.address,
                await chargingBooking.getAddress(),
                0,
                emergencyStopData
            )).to.be.revertedWith("Transaction execution failed");
        });

        it("Should reject double emergency stop", async function () {
            const stationId = 0;
            const watt = 100;
            const power = 500;
            const wattsConsumed = 60;
            const expectedCost = await chargingBooking.calculatePrice(stationId, watt, power);

            // User deposits and makes purchase
            await userWallet.connect(user1).deposit({ value: ethers.parseEther("1.0") });
            const buyData = chargingBooking.interface.encodeFunctionData("buyPower", [user1.address, stationId, watt, power]);

            const initialBookingCount = await chargingBooking.getBookingCount();

            await userWallet.connect(admin).executeTransaction(
                user1.address,
                await chargingBooking.getAddress(),
                expectedCost,
                buyData
            );

            const bookingId = initialBookingCount;

            // First emergency stop
            const emergencyStopData = chargingBooking.interface.encodeFunctionData("emergencyStop", [user1.address, bookingId, wattsConsumed]);

            await userWallet.connect(admin).executeTransaction(
                user1.address,
                await chargingBooking.getAddress(),
                0,
                emergencyStopData
            );

            // Try second emergency stop
            await expect(userWallet.connect(admin).executeTransaction(
                user1.address,
                await chargingBooking.getAddress(),
                0,
                emergencyStopData
            )).to.be.revertedWith("Transaction execution failed");
        });

    });
});