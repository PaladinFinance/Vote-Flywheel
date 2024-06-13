import { BigNumber } from "ethers";
import { IERC20 } from "../../typechain/@openzeppelin/contracts/token/ERC20/IERC20";
import { IERC20__factory } from "../../typechain/factories/@openzeppelin/contracts/token/ERC20/IERC20__factory";

export { };
const hre = require("hardhat");

const ethers = hre.ethers;

async function main() {

    const deployer = (await hre.ethers.getSigners())[0];

    const PAL_address = "0xAB846Fb6C81370327e784Ae7CbB6d6a6af6Ff4BF"
    const PAL = IERC20__factory.connect(PAL_address, hre.ethers.provider);

    const board_crv_address = "0xAa1698f0A51e6d00F5533cc3E5D36010ee4558C6"
    const board_bal_proxy_address = "0x6717A11e6cd2947041377C8BB3A2b99e29f5dd44"
    const board_lit_address = "0xDD3cbe4E0f10910eb435EA6DBe97469ABc3d7e9c"
    const board_fxn_address = "0x59AbF8642f4c7D8d3C5633eDCBBf6B12234FF02D"

    const distributor_crv_address = "0x1327C85CE6F3C83faBC4f5C294F57ac05bCb51eB"
    const distributor_bal_address = "0x1F7b4Bf0CD21c1FBC4F1d995BA0608fDfC992aF4"
    const distributor_lit_address = "0x2DD0496690E7fbb7ca1E590986D5B9d2e58069Bf"
    const distributor_fxn_address = "0x8964c76B6f0253A77129D58cBA5D184d414d7C9a"
    const distributor_bal_aura_address = "0xaEB7993A35e297e42990c62D4E27470B201e8674"

    const loot_controller_address = "0xef163C7bBDf15a19a7E703F3A6283995fa62abdB"
    const loot_budget_address = "0x43Ce46256a6966448fC68E4972A4Aa087ed7261B"
    const loot_creator_address = "0x10785C34C1D26508acDEbd8201C9ad8d2e774a85"

    const controllerFactory = await ethers.getContractFactory("LootVoteController");
    const creatorFactory = await ethers.getContractFactory("LootCreator");
    const MultiMerkleDistributor = await ethers.getContractFactory("MultiMerkleDistributorV2");

    const controller = await controllerFactory.attach(loot_controller_address)
    const creator = await creatorFactory.attach(loot_creator_address)

    const distributor_crv = await MultiMerkleDistributor.attach(distributor_crv_address)
    const distributor_bal = await MultiMerkleDistributor.attach(distributor_bal_address)
    const distributor_lit = await MultiMerkleDistributor.attach(distributor_lit_address)
    const distributor_fxn = await MultiMerkleDistributor.attach(distributor_fxn_address)
    const distributor_bal_aura = await MultiMerkleDistributor.attach(distributor_bal_aura_address)

    let tx;

    /*console.log("Set Creator in Distribs")
    tx = await distributor_crv.connect(deployer).setLootCreator(creator.address)
    await tx
    tx = await distributor_bal.connect(deployer).setLootCreator(creator.address)
    await tx
    tx = await distributor_lit.connect(deployer).setLootCreator(creator.address)
    await tx
    tx = await distributor_fxn.connect(deployer).setLootCreator(creator.address)
    await tx
    tx = await distributor_bal_aura.connect(deployer).setLootCreator(creator.address)
    await tx*/


    /*console.log("List Boards in Controller")
    tx = await controller.connect(deployer).addNewBoard(
        board_crv_address,
        distributor_crv.address
    )
    await tx
    tx = await controller.connect(deployer).addNewBoard(
        board_bal_proxy_address,
        distributor_bal.address
    )
    await tx
    tx = await controller.connect(deployer).addNewBoard(
        board_lit_address,
        distributor_lit.address
    )
    await tx
    tx = await controller.connect(deployer).addNewBoard(
        board_fxn_address,
        distributor_fxn.address
    )
    await tx*/

    console.log("Set Distribs in Creator")
    tx = await creator.connect(deployer).addDistributor(distributor_crv.address, board_crv_address)
    await tx
    tx = await creator.connect(deployer).addDistributor(distributor_bal.address, board_bal_proxy_address)
    await tx
    tx = await creator.connect(deployer).addDistributor(distributor_lit.address, board_lit_address)
    await tx
    tx = await creator.connect(deployer).addDistributor(distributor_fxn.address, board_fxn_address)
    await tx
    tx = await creator.connect(deployer).addDistributor(distributor_bal_aura.address, board_bal_proxy_address)
    await tx

    /*const PAL_amount = ethers.utils.parseEther("1000000")
    console.log("Send PAL to Reserve")
    tx = await PAL.connect(deployer).transfer(loot_budget_address, PAL_amount)
    await tx*/

    console.log()
    console.log('Done !')

}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });