import { BigNumber } from "ethers";

export { };
const hre = require("hardhat");

const ethers = hre.ethers;

const network = hre.network.name;

async function main() {

    const board_crv_address = ""
    const board_bal_address = ""
    const board_bal_aura_address = ""
    const board_lit_address = ""
    const board_fxn_address = ""

    const MultiMerkleDistributor = await ethers.getContractFactory("MultiMerkleDistributorV2");

    console.log()
    console.log('Deploying Distributor veCRV  ...')
    const distributor_crv = await MultiMerkleDistributor.deploy(
        board_crv_address
    )
    await distributor_crv.deployed()
    console.log('Distributor veCRV : ', distributor_crv.address)

    console.log('Deploying Distributor veBAL  ...')
    const distributor_bal = await MultiMerkleDistributor.deploy(
        board_bal_address
    )
    await distributor_bal.deployed()
    console.log('Distributor veBAL : ', distributor_bal.address)

    console.log('Deploying Distributor veLIT  ...')
    const distributor_lit = await MultiMerkleDistributor.deploy(
        board_lit_address
    )
    await distributor_lit.deployed()
    console.log('Distributor veLIT : ', distributor_lit.address)

    console.log('Deploying Distributor veFXN  ...')
    const distributor_fxn = await MultiMerkleDistributor.deploy(
        board_fxn_address
    )
    await distributor_fxn.deployed()
    console.log('Distributor veFXN : ', distributor_fxn.address)

    console.log('Deploying Distributor veBAL AURA ...')
    const distributor_bal_aura = await MultiMerkleDistributor.deploy(
        board_bal_aura_address
    )
    await distributor_bal_aura.deployed()
    console.log('Distributor veBAL AURA : ', distributor_bal_aura.address)

    console.log()
    console.log('Done !')

    if (network === 'mainnet') {
        await hre.run("verify:verify", {
            address: distributor_crv.address,
            constructorArguments: [
                board_crv_address
            ],
        });

        await hre.run("verify:verify", {
            address: distributor_bal.address,
            constructorArguments: [
                board_bal_address
            ],
        });

        await hre.run("verify:verify", {
            address: distributor_lit.address,
            constructorArguments: [
                board_lit_address
            ],
        });

        await hre.run("verify:verify", {
            address: distributor_fxn.address,
            constructorArguments: [
                board_fxn_address
            ],
        });

        await hre.run("verify:verify", {
            address: distributor_bal_aura.address,
            constructorArguments: [
                board_bal_aura_address
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