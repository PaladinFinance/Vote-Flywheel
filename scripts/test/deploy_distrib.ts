import { BigNumber } from "ethers";

export { };
const hre = require("hardhat");

const ethers = hre.ethers;

async function main() {

    const board_crv_address = "0xFfA4c7691bd0e163Ed86fe9C7086C5944cB813C3"
    const board_bal_address = "0xd04ee22C1cF9e1dd839906632A8dA1297ceDADA5"
    const board_lit_address = "0x6c4a5Ae899E86BD2f849b3f53261278e66Ff688C"
    const board_fxn_address = "0x71EA44CB514EfB89444d07640Ed041e5b3f480B1"

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

    console.log()
    console.log('Done !')

}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });