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

    const loot_controller_address = "0xef163C7bBDf15a19a7E703F3A6283995fa62abdB"

    const controllerFactory = await ethers.getContractFactory("LootVoteController");

    const controller = await controllerFactory.attach(loot_controller_address)

    let tx;

    const gauges = [
        // Curve
        {
            gauge: "0x4fb13b55d6535584841dbbdb14edc0258f7ac414",
            board_id: board_crv_id,
            max_weight: ethers.utils.parseEther("0.1")
        },
        {
            gauge: "0x6070fbd4e608ee5391189e7205d70cc4a274c017",
            board_id: board_crv_id,
            max_weight: ethers.utils.parseEther("0.1")
        },
        {
            gauge: "0x75cacebb5b4a73a530edcdfde7cffbfea44c026e",
            board_id: board_crv_id,
            max_weight: ethers.utils.parseEther("0.1")
        },
        {
            gauge: "0x06b30d5f2341c2fb3f6b48b109685997022bd272",
            board_id: board_crv_id,
            max_weight: ethers.utils.parseEther("0.1")
        },
        {
            gauge: "0xd6dacdcb438f048cf90e53415872cdb3fcc95421",
            board_id: board_crv_id,
            max_weight: ethers.utils.parseEther("0.1")
        },
        {
            gauge: "0x5010263ac1978297f56048c7d2b02316a3435404",
            board_id: board_crv_id,
            max_weight: ethers.utils.parseEther("0.1")
        },
        {
            gauge: "0x4645e6476d3a5595be9efd39426cc10586a8393d",
            board_id: board_crv_id,
            max_weight: ethers.utils.parseEther("0.1")
        },
        {
            gauge: "0xcea806562b757aeffa9fe9d0a03c909b4a204254",
            board_id: board_crv_id,
            max_weight: ethers.utils.parseEther("0.1")
        },
        {
            gauge: "0xb901a92f2c385afa0a019e8a307a59a570239ca4",
            board_id: board_crv_id,
            max_weight: ethers.utils.parseEther("0.1")
        },
        {
            gauge: "0x4C1227ECC3F99A3e510DB26fBa72F7A1cBF50586",
            board_id: board_crv_id,
            max_weight: ethers.utils.parseEther("0.1")
        },
        {
            gauge: "0x63037a4e3305d25d48baed2022b8462b2807351c",
            board_id: board_crv_id,
            max_weight: ethers.utils.parseEther("0.1")
        },
        {
            gauge: "0x9da75997624c697444958aded6790bfca96af19a",
            board_id: board_crv_id,
            max_weight: ethers.utils.parseEther("0.1")
        },
        {
            gauge: "0x415F30505368fa1dB82Feea02EB778be04e75907",
            board_id: board_crv_id,
            max_weight: ethers.utils.parseEther("0.1")
        },
        {
            gauge: "0x740BA8aa0052E07b925908B380248cb03f3DE5cB",
            board_id: board_crv_id,
            max_weight: ethers.utils.parseEther("0.1")
        },
        {
            gauge: "0x9582C4ADACB3BCE56Fea3e590F05c3ca2fb9C477",
            board_id: board_crv_id,
            max_weight: ethers.utils.parseEther("0.1")
        },
        {
            gauge: "0xB251c0885c7c1975D773B57e67c138FBcEaa6db4",
            board_id: board_crv_id,
            max_weight: ethers.utils.parseEther("0.1")
        },
        {
            gauge: "0xD5bE6A05B45aEd524730B6d1CC05F59b021f6c87",
            board_id: board_crv_id,
            max_weight: ethers.utils.parseEther("0.1")
        },
        // Balancer
        {
            gauge: "0x7fc115bf013844d6ef988837f7ae6398af153532",
            board_id: board_bal_id,
            max_weight: ethers.utils.parseEther("0.1")
        },
        {
            gauge: "0xbc02ef87f4e15ef78a571f3b2adcc726fee70d8b",
            board_id: board_bal_id,
            max_weight: ethers.utils.parseEther("0.1")
        },
        {
            gauge: "0xc4b6cc9a444337b1cb8cbbdd9de4d983f609c391",
            board_id: board_bal_id,
            max_weight: ethers.utils.parseEther("0.1")
        },
        {
            gauge: "0xa8d974288fe44acc329d7d7a179707d27ec4dd1c",
            board_id: board_bal_id,
            max_weight: ethers.utils.parseEther("0.1")
        },
        {
            gauge: "0x183d73da7adc5011ec3c46e33bb50271e59ec976",
            board_id: board_bal_id,
            max_weight: ethers.utils.parseEther("0.1")
        },
        {
            gauge: "0x21c377cbb2beddd8534308e5cdfebe35fdf817e8",
            board_id: board_bal_id,
            max_weight: ethers.utils.parseEther("0.1")
        },
        {
            gauge: "0xc592c33e51A764B94DB0702D8BAf4035eD577aED",
            board_id: board_bal_id,
            max_weight: ethers.utils.parseEther("0.1")
        },
        {
            gauge: "0xF6FA773b5E54F4BD20E09d806AB483d58dD55dcb",
            board_id: board_bal_id,
            max_weight: ethers.utils.parseEther("0.1")
        },
        {
            gauge: "0x132296d1Dfd10bA55b565C4Cfe49D350617a2A2b",
            board_id: board_bal_id,
            max_weight: ethers.utils.parseEther("0.1")
        },
        {
            gauge: "0x972539E9d340a915775C004715f286a166F067Fd",
            board_id: board_bal_id,
            max_weight: ethers.utils.parseEther("0.1")
        },
        {
            gauge: "0x1461C4a373d27977f0D343Ba33C22870c89F9dF0",
            board_id: board_bal_id,
            max_weight: ethers.utils.parseEther("0.1")
        },
        {
            gauge: "0xCc6A23446f6388D78F3037BD55f2eB820352d982",
            board_id: board_bal_id,
            max_weight: ethers.utils.parseEther("0.1")
        },
        {
            gauge: "0x78a54c8f4eaba82e45cbc20b9454a83cb296e09e",
            board_id: board_bal_id,
            max_weight: ethers.utils.parseEther("0.1")
        },
        {
            gauge: "0x6D560CbE3Cc25Eca8c930835Ec3d296a6C16B210",
            board_id: board_bal_id,
            max_weight: ethers.utils.parseEther("0.1")
        },
        {
            gauge: "0xCD19892916929F013930ed628547Cc1F439b230e",
            board_id: board_bal_id,
            max_weight: ethers.utils.parseEther("0.1")
        },
        // Timeless
        {
            gauge: "0x3b5f433940ed3f57f9ab73e725cf91cfaaef8789",
            board_id: board_lit_id,
            max_weight: ethers.utils.parseEther("0.1")
        },
        {
            gauge: "0x0dd538156cc4b0966d4ab60358ad2b12f57b0961",
            board_id: board_lit_id,
            max_weight: ethers.utils.parseEther("0.1")
        },
        {
            gauge: "0xC11869829D58150d5268e8F2d32BD4815B437142",
            board_id: board_lit_id,
            max_weight: ethers.utils.parseEther("0.1")
        },
        {
            gauge: "0xC433eC439f5A63Bb360F432fb013D572564A9ce1",
            board_id: board_lit_id,
            max_weight: ethers.utils.parseEther("0.1")
        },
        // Fxn
        /*{
            gauge: "xx",
            board_id: board_fxn_id,
            max_weight: ethers.utils.parseEther("0.1")
        }*/
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