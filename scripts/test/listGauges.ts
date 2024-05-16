import { BigNumber } from "ethers";
import { IERC20 } from "../../typechain/@openzeppelin/contracts/token/ERC20/IERC20";
import { IERC20__factory } from "../../typechain/factories/@openzeppelin/contracts/token/ERC20/IERC20__factory";

export { };
const hre = require("hardhat");

const ethers = hre.ethers;

async function main() {

    const deployer = (await hre.ethers.getSigners())[0];

    const board_crv_id = 1
    const board_bal_id = 2
    const board_lit_id = 3
    const board_fxn_id = 4

    const loot_controller_address = ""

    const controllerFactory = await ethers.getContractFactory("LootVoteController");

    const controller = await controllerFactory.attach(loot_controller_address)

    let tx;

    const gauges = [
        {
            gauge: "0x4fb13b55d6535584841dbbdb14edc0258f7ac414",
            board_id: board_crv_id,
            max_weight: ethers.utils.parseEther("0.2")
        },
        {
            gauge: "0x6070fbd4e608ee5391189e7205d70cc4a274c017",
            board_id: board_crv_id,
            max_weight: ethers.utils.parseEther("0.2")
        },
        {
            gauge: "0xb901a92f2c385afa0a019e8a307a59a570239ca4",
            board_id: board_crv_id,
            max_weight: ethers.utils.parseEther("0.2")
        },
        {
            gauge: "0x1461C4a373d27977f0D343Ba33C22870c89F9dF0",
            board_id: board_bal_id,
            max_weight: ethers.utils.parseEther("0.2")
        },
        {
            gauge: "0xbc02ef87f4e15ef78a571f3b2adcc726fee70d8b",
            board_id: board_bal_id,
            max_weight: ethers.utils.parseEther("0.2")
        },
        {
            gauge: "0x78a54c8f4eaba82e45cbc20b9454a83cb296e09e",
            board_id: board_bal_id,
            max_weight: ethers.utils.parseEther("0.2")
        },
        {
            gauge: "0x3b5f433940ed3f57f9ab73e725cf91cfaaef8789",
            board_id: board_lit_id,
            max_weight: ethers.utils.parseEther("0.2")
        },
        {
            gauge: "0xC11869829D58150d5268e8F2d32BD4815B437142",
            board_id: board_lit_id,
            max_weight: ethers.utils.parseEther("0.2")
        },
        {
            gauge: "0xA5250C540914E012E22e623275E290c4dC993D11",
            board_id: board_fxn_id,
            max_weight: ethers.utils.parseEther("0.2")
        }
    ]

    console.log("List Gauges in Controller")
    for(let i = 0; i < gauges.length; i++) {
        const gauge = gauges[i]
        tx = await controller.connect(deployer).addNewGauge(
            gauge.gauge,
            gauge.board_id,
            gauge.max_weight
        )
        //await tx.wait(10)
    }

    console.log()
    console.log('Done !')

}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });