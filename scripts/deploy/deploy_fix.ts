import { BigNumber } from "ethers";

export { };
const hre = require("hardhat");

const ethers = hre.ethers;

const network = hre.network.name;

async function main() {

    const board_main_bal_address = "0xfEb352930cA196a80B708CDD5dcb4eCA94805daB"
    const board_bal_aura_address = "0xfd9F19A9B91BecAE3c8dABC36CDd1eA86Fc1A222"

    const board_crv_address = "0xAa1698f0A51e6d00F5533cc3E5D36010ee4558C6"
    const board_lit_address = "0xDD3cbe4E0f10910eb435EA6DBe97469ABc3d7e9c"
    const board_fxn_address = "0x59AbF8642f4c7D8d3C5633eDCBBf6B12234FF02D"

    const QuestBoardProxy = await ethers.getContractFactory("QuestBoardProxy");

    console.log()
    console.log('Deploying QuestBoardProxy veBAL  ...')
    const board_proxy_veBal = await QuestBoardProxy.deploy(
        board_main_bal_address,
        [board_bal_aura_address]
    )
    await board_proxy_veBal.deployed()
    console.log('QuestBoardProxy veBAL : ', board_proxy_veBal.address)

    console.log()
    console.log('Deploying QuestBoardProxy veCRV  ...')
    const board_proxy_veCRV = await QuestBoardProxy.deploy(
        board_crv_address,
        []
    )
    await board_proxy_veCRV.deployed()
    console.log('QuestBoardProxy veCRV : ', board_proxy_veCRV.address)

    console.log()
    console.log('Deploying QuestBoardProxy veLIT  ...')
    const board_proxy_veLIT = await QuestBoardProxy.deploy(
        board_lit_address,
        []
    )
    await board_proxy_veLIT.deployed()
    console.log('QuestBoardProxy veLIT : ', board_proxy_veLIT.address)

    console.log()
    console.log('Deploying QuestBoardProxy veFXN  ...')
    const board_proxy_veFXN = await QuestBoardProxy.deploy(
        board_fxn_address,
        []
    )
    await board_proxy_veFXN.deployed()
    console.log('QuestBoardProxy veFXN : ', board_proxy_veFXN.address)

    console.log()
    console.log('Done !')

    if (network === 'mainnet') {
        await hre.run("verify:verify", {
            address: board_proxy_veBal.address,
            constructorArguments: [
                board_main_bal_address,
                [board_bal_aura_address]
            ],
        });

        await hre.run("verify:verify", {
            address: board_proxy_veCRV.address,
            constructorArguments: [
                board_crv_address,
                []
            ],
        });

        await hre.run("verify:verify", {
            address: board_proxy_veLIT.address,
            constructorArguments: [
                board_lit_address,
                []
            ],
        });

        await hre.run("verify:verify", {
            address: board_proxy_veFXN.address,
            constructorArguments: [
                board_fxn_address,
                []
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