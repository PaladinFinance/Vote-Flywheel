import { BigNumber } from "ethers";

export { };
const hre = require("hardhat");

const ethers = hre.ethers;

const network = hre.network.name;

async function main() {

    const board_main_bal_address = "0xfEb352930cA196a80B708CDD5dcb4eCA94805daB"
    const board_bal_aura_address = "0xfd9F19A9B91BecAE3c8dABC36CDd1eA86Fc1A222"

    const QuestBoardProxy = await ethers.getContractFactory("QuestBoardProxy");

    console.log()
    console.log('Deploying QuestBoardProxy veBAL  ...')
    const board_proxy = await QuestBoardProxy.deploy(
        board_main_bal_address,
        [board_bal_aura_address]
    )
    await board_proxy.deployed()
    console.log('QuestBoardProxy veBAL : ', board_proxy.address)

    console.log()
    console.log('Done !')

    if (network === 'mainnet') {
        await hre.run("verify:verify", {
            address: board_proxy.address,
            constructorArguments: [
                board_main_bal_address,
                [board_bal_aura_address]
            ],
        });
    }

}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });