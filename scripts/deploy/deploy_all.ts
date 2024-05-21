import { BigNumber } from "ethers";

export { };
const hre = require("hardhat");

const ethers = hre.ethers;

const network = hre.network.name;

async function main() {
    const deployer = (await hre.ethers.getSigners())[0];

    const HPAL = "0x624D822934e87D3534E435b83ff5C19769Efd9f6"
    const PAL_ADDRESS = "0xAB846Fb6C81370327e784Ae7CbB6d6a6af6Ff4BF"
    const EXTRA_TOKEN = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"

    const ADMIN_ADDRESS = ""

    const vestingDuration = BigNumber.from(86400 * 7 * 4)

    const Budget = await ethers.getContractFactory("LootBudget");
    const Controller = await ethers.getContractFactory("LootVoteController");
    const Power = await ethers.getContractFactory("contracts/HolyPalPower.sol:HolyPalPower");
    const DelegProxy = await ethers.getContractFactory("DelegationProxy");
    const Boost = await ethers.getContractFactory("BoostV2");
    const LootCreator = await ethers.getContractFactory("LootCreator");
    const Loot = await ethers.getContractFactory("Loot");
    const Reserve = await ethers.getContractFactory("LootReserve");

    console.log('Deploy hPALPower ...')
    const power = await Power.deploy(
        HPAL
    )
    await power.deployed()
    console.log('hPALPower : ', power.address)

    console.log('Deploy veBoost ...')
    const boost = await Boost.deploy(
        power.address,
    )
    await boost.deployed()
    console.log('veBoost : ', boost.address)

    console.log('Deploy LootController ...')
    const controller = await Controller.deploy(
        power.address
    )
    await controller.deployed()
    console.log('LootController : ', controller.address)

    console.log('Deploy DelegProxy ...')
    const proxy = await DelegProxy.deploy(
        power.address,
        boost.address,
        ADMIN_ADDRESS,
        ADMIN_ADDRESS
    )
    await proxy.deployed()
    console.log('DelegProxy : ', proxy.address)

    console.log('Deploy LootReserve ...')
    const reserve = await Reserve.deploy(
        PAL_ADDRESS,
        EXTRA_TOKEN
    )
    await reserve.deployed()
    console.log('LootReserve : ', reserve.address)

    console.log('Deploy Loot ...')
    const loot = await Loot.deploy(
        PAL_ADDRESS,
        EXTRA_TOKEN,
        reserve.address,
        vestingDuration
    )
    await loot.deployed()
    console.log('Loot : ', loot.address)

    console.log('Deploy LootCreator ...')
    const creator = await LootCreator.deploy(
        loot.address,
        controller.address,
        proxy.address
    )
    await creator.deployed()
    console.log('LootCreator : ', creator.address)

    console.log('Deploy LootBudget ...')
    const budget = await Budget.deploy(
        PAL_ADDRESS,
        EXTRA_TOKEN,
        creator.address,
        reserve.address,
        ethers.utils.parseEther("50000"),
        ethers.utils.parseEther("0"),
        ethers.utils.parseEther("100000"),
        ethers.utils.parseEther("1")
    )
    await budget.deployed()
    console.log('LootBudget : ', budget.address)


    let tx;

    console.log('Init Reserve ...')
    tx = await reserve.init(loot.address)
    await tx.wait(10)

    console.log('Init Creator ...')
    tx = await creator.init(budget.address)
    await tx.wait(10)

    console.log('Set LootCreator in Loot ...')
    tx = await loot.setInitialLootCreator(creator.address)
    await tx.wait(10)

    console.log()
    console.log('Done !')

    if (network === 'mainnet') {
        await hre.run("verify:verify", {
            address: power.address,
            constructorArguments: [
                HPAL
            ],
        });

        await hre.run("verify:verify", {
            address: boost.address,
            constructorArguments: [
                power.address
            ],
        });

        await hre.run("verify:verify", {
            address: controller.address,
            constructorArguments: [
                power.address
            ],
        });

        await hre.run("verify:verify", {
            address: proxy.address,
            constructorArguments: [
                power.address,
                boost.address,
                ADMIN_ADDRESS,
                ADMIN_ADDRESS
            ],
        });

        await hre.run("verify:verify", {
            address: reserve.address,
            constructorArguments: [
                PAL_ADDRESS,
                EXTRA_TOKEN
            ],
        });

        await hre.run("verify:verify", {
            address: loot.address,
            constructorArguments: [
                PAL_ADDRESS,
                EXTRA_TOKEN,
                reserve.address,
                vestingDuration
            ],
        });

        await hre.run("verify:verify", {
            address: creator.address,
            constructorArguments: [
                loot.address,
                controller.address,
                proxy.address
            ],
        });

        await hre.run("verify:verify", {
            address: budget.address,
            constructorArguments: [
                PAL_ADDRESS,
                EXTRA_TOKEN,
                creator.address,
                reserve.address,
                ethers.utils.parseEther("50000"),
                ethers.utils.parseEther("0"),
                ethers.utils.parseEther("100000"),
                ethers.utils.parseEther("1")
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