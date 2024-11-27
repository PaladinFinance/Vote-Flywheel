import { BigNumber } from "ethers";

export { };
const hre = require("hardhat");

const ethers = hre.ethers;

const network = hre.network.name;

async function main() {
    const deployer = (await hre.ethers.getSigners())[0];

    const hpal_power = "0xa241A6670231Ea66AC3bFe95F29c67f2Bb28113b"
    const old_boost = "0x05821eb959CEc55c22E28d20c359Fd4F6f5a7F01"

    const migration_users = [
        '0x68378fCB3A27D5613aFCfddB590d35a6e751972C',
        '0xb7b1Cc940Cc88640089028d4910De22E39e6D117',
        '0x554Bb0ebABc7024D2182286912739ef68645250a',
        '0x9824697F7c12CAbAda9b57842060931c48dEA969',
        '0x62bC3dE30E94277213c44C21c55ae0bEe8AA956F',
        '0x79603115Df2Ba00659ADC63192325CF104ca529C',
        '0xCF339235b44198c990bc0D674cC6C7F3BFFe1d1a',
        '0x9D2Da9a98AF5CbAed356E190c2E05DCA21aba63e',
        '0xEd4202Fc328BD93514c6Bd51f02410e9beA3ba3a',
        '0x7d90055F1334e5F5A7516BEe032944B3533009D3',
        '0xc1C39B466A3660E64bFC5c256E6b8E7083957a4A',
        '0x975a9E5F94e3c2ad0C7B423E0b4C87Afc86F2d94',
        '0x009d13E9bEC94Bf16791098CE4E5C168D27A9f07',
        '0xdBD5fA8BE37931C3289B8f0737fE60D0502a2487',
        '0xa22301e3f0244e8f7C6062a0Ef5bb840c1AD66F8',
        '0xAFe4043c9FFd31753c5bE2B76dfc45AaA70ebD6f'
    ]

    const Boost = await ethers.getContractFactory("BoostV2");

    console.log('Deploy veBoost ...')
    const boost = await Boost.deploy(
        hpal_power,
        old_boost
    )
    await boost.deployed()
    console.log('veBoost : ', boost.address)

    for(let i = 0; i < migration_users.length; i++) {
        console.log('Migrate user : ', migration_users[i])
        await boost.migrate(migration_users[i])
    }
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });