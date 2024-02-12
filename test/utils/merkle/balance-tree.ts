import MerkleTree from './merkle-tree'
import { BigNumber, utils } from 'ethers'
/*import { keccak256 } from 'ethereum-cryptography/keccak';
import { hexToBytes } from 'ethereum-cryptography/utils';
import { defaultAbiCoder } from '@ethersproject/abi';*/

export default class BalanceTree {
  private readonly tree: MerkleTree
  constructor(balances: {questID:BigNumber, period:BigNumber, account: string; amount: BigNumber }[]) {
    this.tree = new MerkleTree(
      balances.map(({questID, period,  account, amount }, index) => {
        return BalanceTree.toNode(questID, period, index, account, amount)
      })
    )
  }

  public static verifyProof(
    questID:BigNumber, 
    period:BigNumber, 
    index: number | BigNumber,
    account: string,
    amount: BigNumber,
    proof: Buffer[],
    root: Buffer
  ): boolean {
    let pair = BalanceTree.toNode(questID, period, index, account, amount)
    for (const item of proof) {
      pair = MerkleTree.combinedHash(pair, item)
    }

    return pair.equals(root)
  }

  public static toNode(questID:BigNumber, period:BigNumber,index: number | BigNumber, account: string, amount: BigNumber): Buffer {
    return Buffer.from(
      utils.solidityKeccak256(['uint256', 'uint256', 'uint256', 'address', 'uint256'], [ questID, period, index, account, amount]).substr(2),
      'hex'
    )
    /*return Buffer.from(keccak256(keccak256(hexToBytes(defaultAbiCoder.encode(
      ['uint256', 'uint256', 'uint256', 'address', 'uint256'],
      [ questID, period, index, account, amount]
    )))));*/
  }

  public getHexRoot(): string {
    return this.tree.getHexRoot()
  }

  // returns the hex bytes32 values of the proof
  public getProof(questID:BigNumber, period:BigNumber, index: number | BigNumber, account: string, amount: BigNumber): string[] {
    return this.tree.getHexProof(BalanceTree.toNode(questID, period, index, account, amount))
  }
}