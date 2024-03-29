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

    const board_crv_address = "0xFfA4c7691bd0e163Ed86fe9C7086C5944cB813C3"
    const board_bal_address = "0xd04ee22C1cF9e1dd839906632A8dA1297ceDADA5"
    const board_lit_address = "0x6c4a5Ae899E86BD2f849b3f53261278e66Ff688C"
    const board_fxn_address = "0x71EA44CB514EfB89444d07640Ed041e5b3f480B1"

    const distributor_crv_address = "0xC912273c361619d7FBEff1Ced920560fbfc38d8C"
    const distributor_bal_address = "0x8A542E343df9700cB83FE7b959d0Ac6FE32ee77e"
    const distributor_lit_address = "0xD8B9147B8f77721635b1C4128c25dA601F10edc4"
    const distributor_fxn_address = "0x85D2C5774072FE9aE96D884CecE609832f89a572"

    const loot_controller_address = "0x67Db2E37a234a12218A826B190e0910b418b759a"
    const loot_budget_address = "0xecf196779da36F015B7d61d44cA3c1b203b8f57F"
    const loot_creator_address = "0xb24E091616Cb4512Ab9C792d629Dd87bB528D6fe"

    const controllerFactory = await ethers.getContractFactory("LootVoteController");
    const creatorFactory = await ethers.getContractFactory("LootCreator");
    const MultiMerkleDistributor = await ethers.getContractFactory("MultiMerkleDistributorV2");

    const controller = await controllerFactory.attach(loot_controller_address)
    const creator = await creatorFactory.attach(loot_creator_address)

    const distributor_crv = await MultiMerkleDistributor.attach(distributor_crv_address)
    const distributor_bal = await MultiMerkleDistributor.attach(distributor_bal_address)
    const distributor_lit = await MultiMerkleDistributor.attach(distributor_lit_address)
    const distributor_fxn = await MultiMerkleDistributor.attach(distributor_fxn_address)

    let tx;

    console.log("Set Creator in Distribs")
    tx = await distributor_crv.connect(deployer).setLootCreator(creator.address)
    await tx.wait(10)
    tx = await distributor_bal.connect(deployer).setLootCreator(creator.address)
    await tx.wait(10)
    tx = await distributor_lit.connect(deployer).setLootCreator(creator.address)
    await tx.wait(10)
    tx = await distributor_fxn.connect(deployer).setLootCreator(creator.address)
    await tx.wait(10)

    console.log("List Boards in Controller")
    tx = await controller.connect(deployer).addNewBoard(
        board_crv_address,
        distributor_crv.address
    )
    await tx.wait(10)
    tx = await controller.connect(deployer).addNewBoard(
        board_bal_address,
        distributor_bal.address
    )
    await tx.wait(10)
    tx = await controller.connect(deployer).addNewBoard(
        board_lit_address,
        distributor_lit.address
    )
    await tx.wait(10)
    tx = await controller.connect(deployer).addNewBoard(
        board_fxn_address,
        distributor_fxn.address
    )
    await tx.wait(10)

    console.log("Set Distribs in Creator")
    tx = await creator.connect(deployer).addDistributor(distributor_crv.address)
    await tx.wait(10)
    tx = await creator.connect(deployer).addDistributor(distributor_bal.address)
    await tx.wait(10)
    tx = await creator.connect(deployer).addDistributor(distributor_lit.address)
    await tx.wait(10)
    tx = await creator.connect(deployer).addDistributor(distributor_fxn.address)
    await tx.wait(10)

    const PAL_amount = ethers.utils.parseEther("1000000")
    console.log("Send PAL to Reserve")
    tx = await PAL.connect(deployer).transfer(loot_budget_address, PAL_amount)
    await tx.wait(10)

    console.log()
    console.log('Done !')

}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });