require("@nomicfoundation/hardhat-toolbox");
require('dotenv').config({ quiet: true })

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
    solidity: {
        version: "0.8.28",
        settings: {
            evmVersion: "cancun",
            optimizer: {
                enabled: true,
                runs: 200,   
            }
        }
    },
    networks: {
        testnet: {
            url: process.env.SEI_TESTNET_RPC_URL,
            accounts: [process.env.SEI_TESTNET_PRIVATE_KEY],
            chainId: 1328,
        },
    },
    gasReporter: {
        enabled: false
    }
};