import { toBN } from "web3-utils";
import {
  bitsToNumber,
  toFixedHex,
  poseidonHash2,
  getExtDepositArgsHash,
  getExtWithdrawArgsHash,
  packEncryptedMessage,
  getDepositProofHash,
} from "./utils";
import { Account } from "./account";
import MerkleTree from "fixed-merkle-tree";
import { Address } from "@celo/contractkit";
import BN from "bn.js";
import { utils } from "ffjavascript";
import { Poof } from "./generated/Poof";

type DepositParams = {
  account: Account;
  publicKey: string;
  amount: BN;
  debt: BN;
  unitPerUnderlying: BN;
  accountCommitments?: BN[];
};

type WithdrawParams = {
  account: Account;
  amount: BN;
  debt: BN;
  unitPerUnderlying: BN;
  depositProof?: any;
  depositArgs?: any;
  recipient: Address;
  publicKey: string;
  fee: BN;
  relayer: 0 | Address;
  accountCommitments?: BN[];
};

const fetchAccountCommitments = async (poof: Poof) => {
  const events = await poof.getPastEvents("NewAccount", {
    fromBlock: 0,
    toBlock: "latest",
  });
  return events
    .sort((a, b) => a.returnValues.index - b.returnValues.index)
    .map((e) => toBN(e.returnValues.commitment));
};

export class Controller {
  private merkleTreeHeight: number;
  private provingKeys: any;
  private snarkjs: any;

  constructor({ merkleTreeHeight = 20, snarkjs, provingKeys }) {
    this.merkleTreeHeight = Number(merkleTreeHeight);
    this.snarkjs = snarkjs;
    this.provingKeys = provingKeys;
  }

  _updateTree(tree: any, element: any) {
    const oldRoot = tree.root();
    tree.insert(element);
    const newRoot = tree.root();
    const { pathElements, pathIndices } = tree.path(tree.elements().length - 1);
    return {
      oldRoot,
      newRoot,
      pathElements,
      pathIndices: bitsToNumber(pathIndices),
    };
  }

  async deposit(
    poof: Poof,
    {
      account,
      amount,
      debt,
      unitPerUnderlying,
      publicKey,
      accountCommitments,
    }: DepositParams
  ) {
    const newAmount = account.amount.add(amount);
    const newDebt = account.debt.sub(debt);
    const newAccount = new Account({
      amount: newAmount.toString(),
      debt: newDebt.toString(),
    });

    accountCommitments =
      accountCommitments || (await fetchAccountCommitments(poof));
    const accountTree = new MerkleTree(
      this.merkleTreeHeight,
      accountCommitments,
      {
        hashFunction: poseidonHash2,
      }
    );
    const zeroAccount = {
      pathElements: new Array(this.merkleTreeHeight).fill(0),
      pathIndices: new Array(this.merkleTreeHeight).fill(0),
    };
    const accountIndex = accountTree.indexOf(
      account.commitment,
      (a: any, b: any) => a.eq(b)
    );
    const accountPath =
      accountIndex !== -1 ? accountTree.path(accountIndex) : zeroAccount;
    const accountTreeUpdate = this._updateTree(
      accountTree,
      newAccount.commitment
    );

    const encryptedAccount = packEncryptedMessage(
      newAccount.encrypt(publicKey)
    );
    const extDataHash = getExtDepositArgsHash({ encryptedAccount });

    const input = {
      amount,
      debt,
      unitPerUnderlying,
      extDataHash,

      inputAmount: account.amount,
      inputDebt: account.debt,
      inputSecret: account.secret,
      inputNullifier: account.nullifier,
      inputRoot: accountTreeUpdate.oldRoot,
      inputPathElements: accountPath.pathElements,
      inputPathIndices: bitsToNumber(accountPath.pathIndices),
      inputNullifierHash: account.nullifierHash,

      outputAmount: newAccount.amount,
      outputDebt: newAccount.debt,
      outputSecret: newAccount.secret,
      outputNullifier: newAccount.nullifier,
      outputRoot: accountTreeUpdate.newRoot,
      outputPathIndices: accountTreeUpdate.pathIndices,
      outputPathElements: accountTreeUpdate.pathElements,
      outputCommitment: newAccount.commitment,
    };

    const { proof: proofData } = await this.snarkjs.plonk.fullProve(
      utils.stringifyBigInts(input),
      this.provingKeys.depositWasm,
      this.provingKeys.depositZkey
    );
    const [proof] = (
      await this.snarkjs.plonk.exportSolidityCallData(
        utils.unstringifyBigInts(proofData),
        []
      )
    ).split(",");

    const args = {
      amount: toFixedHex(amount),
      debt: toFixedHex(debt),
      unitPerUnderlying: toFixedHex(unitPerUnderlying),
      extDataHash,
      extData: {
        encryptedAccount,
      },
      account: {
        inputRoot: toFixedHex(input.inputRoot),
        inputNullifierHash: toFixedHex(input.inputNullifierHash),
        outputRoot: toFixedHex(input.outputRoot),
        outputPathIndices: toFixedHex(input.outputPathIndices),
        outputCommitment: toFixedHex(input.outputCommitment),
      },
    };

    return {
      proof,
      args,
      account: newAccount,
    };
  }

  async withdraw(
    poof: Poof,
    {
      account,
      amount: withdrawAmount,
      debt,
      unitPerUnderlying,
      depositProof,
      depositArgs,
      recipient,
      publicKey,
      fee = toBN(0),
      relayer = 0,
    }: WithdrawParams
  ) {
    const amount = toBN(depositArgs ? depositArgs.amount : withdrawAmount).add(
      fee
    );
    const newAmount = account.amount.sub(amount);
    const newDebt = account.debt.add(debt);
    const newAccount = new Account({
      amount: newAmount.toString(),
      debt: newDebt.toString(),
    });

    const accountCommitments = await fetchAccountCommitments(poof);
    const accountTree = new MerkleTree(
      this.merkleTreeHeight,
      accountCommitments,
      {
        hashFunction: poseidonHash2,
      }
    );
    const accountIndex = accountTree.indexOf(account.commitment, (a, b) =>
      a.eq(b)
    );
    if (accountIndex === -1) {
      throw new Error(
        "The accounts tree does not contain such account commitment"
      );
    }
    const accountPath = accountTree.path(accountIndex);
    const accountTreeUpdate = this._updateTree(
      accountTree,
      newAccount.commitment
    );

    const encryptedAccount = packEncryptedMessage(
      newAccount.encrypt(publicKey)
    );
    const depositProofHash = getDepositProofHash(depositProof);
    const extDataHash = getExtWithdrawArgsHash({
      fee,
      recipient,
      relayer,
      depositProofHash,
      encryptedAccount,
    });

    const input = {
      amount,
      debt,
      unitPerUnderlying,
      extDataHash,

      inputAmount: account.amount,
      inputDebt: account.debt,
      inputSecret: account.secret,
      inputNullifier: account.nullifier,
      inputNullifierHash: account.nullifierHash,
      inputRoot: accountTreeUpdate.oldRoot,
      inputPathIndices: bitsToNumber(accountPath.pathIndices),
      inputPathElements: accountPath.pathElements,

      outputAmount: newAccount.amount,
      outputDebt: newAccount.debt,
      outputSecret: newAccount.secret,
      outputNullifier: newAccount.nullifier,
      outputRoot: accountTreeUpdate.newRoot,
      outputPathIndices: accountTreeUpdate.pathIndices,
      outputPathElements: accountTreeUpdate.pathElements,
      outputCommitment: newAccount.commitment,
    };

    const args = {
      amount: toFixedHex(input.amount),
      debt: toFixedHex(input.debt),
      unitPerUnderlying: toFixedHex(input.unitPerUnderlying),
      extDataHash: toFixedHex(input.extDataHash),
      extData: {
        fee: toFixedHex(fee),
        recipient: toFixedHex(recipient, 20),
        relayer: toFixedHex(relayer, 20),
        depositProofHash,
        encryptedAccount,
      },
      account: {
        inputRoot: toFixedHex(input.inputRoot),
        inputNullifierHash: toFixedHex(input.inputNullifierHash),
        outputRoot: toFixedHex(input.outputRoot),
        outputPathIndices: toFixedHex(input.outputPathIndices),
        outputCommitment: toFixedHex(input.outputCommitment),
      },
    };

    const { proof: proofData } = await this.snarkjs.plonk.fullProve(
      utils.stringifyBigInts(input),
      this.provingKeys.withdrawWasm,
      this.provingKeys.withdrawZkey
    );
    const [proof] = (
      await this.snarkjs.plonk.exportSolidityCallData(
        utils.unstringifyBigInts(proofData),
        []
      )
    ).split(",");
    return {
      proof,
      args,
      account: newAccount,
    };
  }

  async treeUpdate(poof: Poof, commitment: any, accountTree = null) {
    if (!accountTree) {
      const accountCommitments = await fetchAccountCommitments(poof);
      accountTree = new MerkleTree(this.merkleTreeHeight, accountCommitments, {
        hashFunction: poseidonHash2,
      });
    }
    const accountTreeUpdate = this._updateTree(accountTree, commitment);

    const input = {
      oldRoot: accountTreeUpdate.oldRoot,
      newRoot: accountTreeUpdate.newRoot,
      leaf: commitment,
      pathIndices: accountTreeUpdate.pathIndices,
      pathElements: accountTreeUpdate.pathElements,
    };

    const { proof: proofData } = await this.snarkjs.plonk.fullProve(
      utils.stringifyBigInts(input),
      "https://github.com/poofcash/poof-v2/releases/download/v0.0.1/TreeUpdate.wasm",
      "https://github.com/poofcash/poof-v2/releases/download/v0.0.1/TreeUpdate_circuit_final.zkey"
    );
    const [proof] = (
      await this.snarkjs.plonk.exportSolidityCallData(
        utils.unstringifyBigInts(proofData),
        []
      )
    ).split(",");

    const args = {
      oldRoot: toFixedHex(input.oldRoot),
      newRoot: toFixedHex(input.newRoot),
      leaf: toFixedHex(input.leaf),
      pathIndices: toFixedHex(input.pathIndices),
    };

    return {
      proof,
      args,
    };
  }
}
