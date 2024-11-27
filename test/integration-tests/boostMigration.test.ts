const hre = require("hardhat");
import { ethers, waffle } from "hardhat";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import { BoostV2 } from "../../typechain/contracts/boost/BoostV2.vy/BoostV2";
import { HolyPalPower } from "../../typechain/contracts/HolyPalPower";
import { IHolyPaladinToken } from "../../typechain/contracts/interfaces/IHolyPaladinToken";
import { IHolyPaladinToken__factory } from "../../typechain/factories/contracts/interfaces/IHolyPaladinToken__factory";
import { BoostV2__factory } from "../../typechain/factories/contracts/boost/BoostV2.vy/BoostV2__factory";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { ContractFactory } from "@ethersproject/contracts";
import { BigNumber } from "@ethersproject/bignumber";

import {
    advanceTime,
    resetFork
} from "../utils/utils";

import {
    HPAL
} from "./constant";

chai.use(solidity);
const { expect } = chai;
const { provider } = ethers;

const OLD_BOOST = "0x05821eb959CEc55c22E28d20c359Fd4F6f5a7F01"

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

let boostFactory: ContractFactory
let powerFactory: ContractFactory

const WEEK = BigNumber.from(86400 * 7)
const start_period = BigNumber.from(1716163200).div(WEEK).mul(WEEK)

describe('veBoost Migration tests', () => {
    let admin: SignerWithAddress

    let power: HolyPalPower

    let hPal: IHolyPaladinToken

    let boost: BoostV2

    let old_boost: BoostV2

    before(async () => {
        await resetFork(21223700);

        [admin] = await ethers.getSigners();

        boostFactory = await ethers.getContractFactory("BoostV2");
        powerFactory = await ethers.getContractFactory("contracts/HolyPalPower.sol:HolyPalPower");

        hPal = IHolyPaladinToken__factory.connect(HPAL, provider);

        old_boost = BoostV2__factory.connect(OLD_BOOST, provider);

    })

    beforeEach(async () => {

        power = (await powerFactory.connect(admin).deploy(
            HPAL
        )) as HolyPalPower
        await power.deployed()

        boost = (await boostFactory.connect(admin).deploy(
            power.address,
            OLD_BOOST
        )) as BoostV2
        await boost.deployed()

    });

    it(' should be deployed correctly', async () => {
        expect(power.address).to.properAddress
        expect(boost.address).to.properAddress

        expect(await power.hPal()).to.be.eq(HPAL)

        expect(await boost.HOLY_PAL_POWER()).to.be.equal(power.address)
        expect(await boost.name()).to.be.equal("HolyPal Power Boost")
        expect(await boost.symbol()).to.be.equal("hPalBoost")
        expect(await boost.decimals()).to.be.equal(18)
    });

    describe('migrate', async () => {

        for(let idx in migration_users) {
            let user = migration_users[idx]

            it(`should migrate user ${user}`, async () => {

                await boost.connect(admin).migrate(user)

                const user_delegated_nonces = await old_boost.delegated_checkpoints_nonces(user)
                const user_received_nonces = await old_boost.received_checkpoints_nonces(user)

                // Add 1 because the migration applied a checkpoint at the end
                expect(await boost.delegated_checkpoints_nonces(user)).to.be.eq(user_delegated_nonces.add(1))
                expect(await boost.received_checkpoints_nonces(user)).to.be.eq(user_received_nonces.add(1))

                for(let i = 0; i < user_delegated_nonces.toNumber(); i++) {
                    const checkpoint = await old_boost.delegated(user, i)
                    const new_checkpoint = await boost.delegated(user, i)

                    expect(checkpoint.bias).to.be.eq(new_checkpoint.bias)
                    expect(checkpoint.slope).to.be.eq(new_checkpoint.slope)
                    expect(checkpoint.ts).to.be.eq(new_checkpoint.ts)

                    expect(await boost.delegated_checkpoints_dates(user, i)).to.be.eq(
                        await old_boost.delegated_checkpoints_dates(user, i)
                    )
                }

                for(let j = 0; j < user_received_nonces.toNumber(); j++) {
                    const checkpoint = await old_boost.received(user, j)
                    const new_checkpoint = await boost.received(user, j)

                    expect(checkpoint.bias).to.be.eq(new_checkpoint.bias)
                    expect(checkpoint.slope).to.be.eq(new_checkpoint.slope)
                    expect(checkpoint.ts).to.be.eq(new_checkpoint.ts)

                    expect(await boost.received_checkpoints_dates(user, j)).to.be.eq(
                        await old_boost.received_checkpoints_dates(user, j)
                    )
                }


                for(let k = 0; k < 255; k++) {
                    let ts = start_period.add(WEEK.mul(k))

                    expect(await boost.delegated_slope_changes(user, ts)).to.be.eq(
                        await old_boost.delegated_slope_changes(user, ts)
                    )
                    expect(await boost.delegated_slope_changes(user, ts)).to.be.eq(
                        await old_boost.delegated_slope_changes(user, ts)
                    )
                }
                
            });
        }

    });

});