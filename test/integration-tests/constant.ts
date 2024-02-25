import { ethers } from "hardhat";
import { BigNumber } from "@ethersproject/bignumber";

export const HPAL = "0x624D822934e87D3534E435b83ff5C19769Efd9f6"

export const HPAL_LOCKERS = [
    "0xd70e3e8e0df4792855aB27f2E1308f125D12E869",
    "0x9824697F7c12CAbAda9b57842060931c48dEA969",
    "0x7d90055F1334e5F5A7516BEe032944B3533009D3"
]

export const BOARDS = [
    {
        'board': "0xF13e938d7a1214ae438761941BC0C651405e68A4", // veCRV Board
        'distributor': "0x999881aA210B637ffF7d22c8566319444B38695B"
    },
    {
        'board': "0xf0CeABf99Ddd591BbCC962596B228007eD4624Ae", // veBAL Board,
        'distributor': "0xc413aB9c6d3E60E41a530b0A68817BAeA7bABbEC"
    },
    {
        'board': "0x1B921DBD13A280ee14BA6361c1196EB72aaa094e", // veLIT Board
        'distributor': "0xCcD73d064Ed07964Ad2144fDFd1b99e7E6b5f626"
    },
]

export const VALID_GAUGES = [
    {
        'gauge': "0x4fb13b55D6535584841dbBdb14EDC0258F7aC414",
        'board': "0xF13e938d7a1214ae438761941BC0C651405e68A4"
    },
    {
        'gauge': "0x6070fBD4E608ee5391189E7205d70cc4A274c017",
        'board': "0xF13e938d7a1214ae438761941BC0C651405e68A4"
    },
    {
        'gauge': "0xd758454BDF4Df7Ad85f7538DC9742648EF8e6d0A",
        'board': "0xf0CeABf99Ddd591BbCC962596B228007eD4624Ae"
    },
    {
        'gauge': "0x7Fc115BF013844D6eF988837F7ae6398af153532",
        'board': "0xf0CeABf99Ddd591BbCC962596B228007eD4624Ae"
    }
]

export const PAL_ADDRESS = "0xAB846Fb6C81370327e784Ae7CbB6d6a6af6Ff4BF"
export const PAL_HOLDER = "0x830B63eA52CCcf241A329F3932B4cfCf17287ed7"
export const PAL_AMOUNT = ethers.utils.parseEther("500000")

export const REWARD_TOKEN = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"
export const REWARD_HOLDER = "0x8EB8a3b98659Cce290402893d0123abb75E3ab28"
export const REWARD_AMOUNT = ethers.utils.parseEther('25000');

export const BLOCK_NUMBER = 18735000

export const BOARD_ADMIN = "0x0792dCb7080466e4Bbc678Bdb873FE7D969832B8"