import { BigNumber } from "ethers";
import { IERC20 } from "../../typechain/@openzeppelin/contracts/token/ERC20/IERC20";
import { IERC20__factory } from "../../typechain/factories/@openzeppelin/contracts/token/ERC20/IERC20__factory";

export { };
const hre = require("hardhat");

const ethers = hre.ethers;

async function main() {

    const deployer = (await hre.ethers.getSigners())[0];

    const loot_budget_address = "0x43Ce46256a6966448fC68E4972A4Aa087ed7261B"
    const loot_creator_address = "0x10785C34C1D26508acDEbd8201C9ad8d2e774a85"

    
    const Budget = await ethers.getContractFactory("LootBudget");
    
    const Creator = await ethers.getContractFactory("LootCreator");

    const budget = await Budget.attach(loot_budget_address)
    const creator = await Creator.attach(loot_creator_address)
    

    let tx;

    /*
    tx = await budget.connect(deployer).setPalWeeklyLimit(ethers.utils.parseEther("100000"))
    await tx

    tx = await budget.connect(deployer).updatePalWeeklyBudget(ethers.utils.parseEther("50000"))
    await tx*/

    tx = await creator.connect(deployer).updatePeriod()
    await tx

    console.log()
    console.log('Done !')

}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });