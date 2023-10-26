const hre = require("hardhat");
import { ethers } from "hardhat";
import { BigNumber, Contract } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { IERC20__factory } from "../../typechain/factories/@openzeppelin/contracts/token/ERC20/IERC20__factory";

const { provider } = ethers;

require("dotenv").config();

export async function resetFork() {
    await hre.network.provider.request({
        method: "hardhat_reset",
        params: [
            {
                forking: {
                    jsonRpcUrl: "https://eth-mainnet.alchemyapi.io/v2/" + (process.env.ALCHEMY_API_KEY || ''),
                    blockNumber: 18428190
                },
                gas: 30000000,
            },
        ],
    });

}

const toBytes32 = (bn: BigNumber) => {
    return ethers.utils.hexlify(ethers.utils.zeroPad(bn.toHexString(), 32));
};

export async function mintTokenStorage(
    token: string,
    recipient: SignerWithAddress,
    amount: BigNumber,
    slot: number
) {

    const index = ethers.utils.solidityKeccak256(
        ["uint256", "uint256"],
        [recipient.address, slot] // key, slot
    );

    await hre.network.provider.send("hardhat_setStorageAt", [
        token,
        index.toString(),
        toBytes32(amount).toString(),
    ]);

}

export async function getTimestamp(
    day: number,
    month: number,
    year: number,
    hours: number = 0,
    minutes: number = 0
) {
    let date = new Date(year, month, day, hours, minutes, 0)
    return Math.floor(date.getTime() / 1000)
}

export async function setBlockTimestamp(
    timestamp: string,
) {
    await hre.network.provider.send("evm_setNextBlockTimestamp", [timestamp])
    await hre.network.provider.send("evm_mine")
}


export async function advanceTime(
    seconds: number
) {
    await hre.network.provider.send("evm_mine")
    await hre.network.provider.send("evm_increaseTime", [seconds])
    await hre.network.provider.send("evm_mine")
}

export async function getERC20(
    admin: SignerWithAddress,
    holder: string,
    erc20_contract: Contract,
    recipient: string,
    amount: BigNumber
) {

    await hre.network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [holder],
    });

    await admin.sendTransaction({
        to: holder,
        value: ethers.utils.parseEther("10"),
    });

    const signer = await ethers.getSigner(holder)

    await erc20_contract.connect(signer).transfer(recipient, amount);

    await hre.network.provider.request({
        method: "hardhat_stopImpersonatingAccount",
        params: [holder],
    });
}

export async function stopAutoMine() {
    await hre.network.provider.send("evm_setAutomine", [false]);
    await hre.network.provider.send("evm_setIntervalMining", [0]);
}

export async function startAutoMine() {
    await hre.network.provider.send("evm_setAutomine", [true]);
}

export async function mineNextBlock() {
    await hre.network.provider.send("evm_mine")
}