import { BigNumber } from "ethers";

export { };
const hre = require("hardhat");

const ethers = hre.ethers;

async function main() {

    const board_address = "0x5796d6346b515cc3997e764dd32103f9ae09fb80"

    const MultiMerkleDistributor = await ethers.getContractFactory("MultiMerkleDistributorV2");
    console.log('Deploying QuestBoard  ...')

    console.log()
    console.log('Deploying Distributor  ...')

    const distributor = await MultiMerkleDistributor.deploy(
        board_address
    )
    await distributor.deployed()

    console.log('Distributor : ', distributor.address)
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });