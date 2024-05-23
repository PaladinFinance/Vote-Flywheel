import { BigNumber } from "ethers";
import { IERC20 } from "../../typechain/@openzeppelin/contracts/token/ERC20/IERC20";
import { IERC20__factory } from "../../typechain/factories/@openzeppelin/contracts/token/ERC20/IERC20__factory";

export { };
const hre = require("hardhat");

const ethers = hre.ethers;

async function main() {

    const deployer = (await hre.ethers.getSigners())[0];

    const loot_budget_address = "0x43Ce46256a6966448fC68E4972A4Aa087ed7261B"

    
    const Budget = await ethers.getContractFactory("LootBudget");

    const budget = await Budget.attach(loot_budget_address)
    

    let tx;

    tx = await budget.connect(deployer).setPalWeeklyLimit(ethers.utils.parseEther("50000"))
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