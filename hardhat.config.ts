import { HardhatUserConfig } from "hardhat/types";

import "@nomiclabs/hardhat-waffle";
import "@nomiclabs/hardhat-vyper";
import "@typechain/hardhat";
import "hardhat-contract-sizer";
import "@nomiclabs/hardhat-etherscan";
import "solidity-coverage";
import "hardhat-gas-reporter";
import "solidity-docgen";

/*import * as tdly from "@tenderly/hardhat-tenderly";
tdly.setup({ automaticVerifications: false });*/

require("dotenv").config();


const TEST_MNEMONIC = "test test test test test test test test test test test junk";
const TEST_ACCOUNT = { mnemonic: TEST_MNEMONIC, }


const config: HardhatUserConfig = {
  defaultNetwork: "hardhat",
  solidity: {
    compilers: [
      {
        version: "0.8.20",
        settings: {
          optimizer: {
            enabled: true,
            runs: 999999,
          },
          viaIR: true
        }
      }
    ],
    overrides: {},
  },
  vyper: {
    compilers: [{ version: "0.3.3" }],
  },
  contractSizer: {
    alphaSort: true,
    runOnCompile: true,
    disambiguatePaths: false,
  },
  networks: {
    hardhat: {
      forking: {
        url: "https://eth-mainnet.alchemyapi.io/v2/" + (process.env.ALCHEMY_API_KEY || ''),
        blockNumber: 18428190,
      },
      gas: 30000000,
    },
    mainnet: {
      url: process.env.MAINNET_URI || '',
      accounts: process.env.MAINNET_PRIVATE_KEY ? [process.env.MAINNET_PRIVATE_KEY] : TEST_ACCOUNT,
    },
    fork: {
      url: process.env.FORK_URI || '',
      accounts: process.env.FORK_PRIVATE_KEY ? [process.env.FORK_PRIVATE_KEY] : TEST_ACCOUNT,
    },
  },
  mocha: {
    timeout: 0
  },
  etherscan: {
    // Your API key for Etherscan
    // Obtain one at https://etherscan.io/
    apiKey: process.env.ETHERSCAN_API_KEY || ''
  },
  typechain: {
    outDir: "typechain",
    target: "ethers-v5"
  },
  gasReporter: {
    enabled: true
  },
  docgen: {
    outputDir: 'docs',
    pages: 'files',
    exclude: [
      './interfaces',
      './test',
      './utils'
    ]
  },
  /*tenderly: {
    // https://docs.tenderly.co/account/projects/account-project-slug
    project: "warden",
    username: "paladin",
    privateVerification: true,
  },*/
};

export default config;
