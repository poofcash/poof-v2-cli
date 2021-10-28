import { toBN } from "web3-utils";
import {
  bitsToNumber,
  toFixedHex,
  poseidonHash2,
  getExtDepositArgsHash,
  getExtWithdrawArgsHash,
  packEncryptedMessage,
} from "./utils";
import { Account } from "./account";
import MerkleTree from "fixed-merkle-tree";
import BN from "bn.js";
import { utils } from "ffjavascript";
import { Poof } from "./generated/Poof";
import { ProvingKeys } from "./kit";

type DepositParams = {
  account: Account;
  publicKey: string;
  amount: BN;
  debt: BN;
  unitPerUnderlying: BN;
  accountCommitments: BN[];
};

type WithdrawParams = {
  account: Account;
  amount: BN;
  debt: BN;
  unitPerUnderlying: BN;
  depositProof?: any;
  depositArgs?: any;
  recipient: string;
  publicKey: string;
  fee: BN;
  relayer: 0 | string;
  accountCommitments: BN[];
};

type ProofDep = {
  getWasm: () => Promise<Uint8Array>;
  getZkey: () => Promise<Uint8Array>;
};

export class Controller {
  private merkleTreeHeight: number;
  private provingKeys: ProvingKeys;
  private getSnarkJs: () => any;

  constructor({ merkleTreeHeight = 20, getSnarkJs, provingKeys }) {
    this.merkleTreeHeight = Number(merkleTreeHeight);
    this.getSnarkJs = getSnarkJs;
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

  async getProof(input: any, dep: ProofDep) {
    const snarkJs = this.getSnarkJs();
    const { proof: depositProofData } = await snarkJs.plonk.fullProve(
      utils.stringifyBigInts(input),
      await dep.getWasm(),
      await dep.getZkey()
    );
    return (
      await snarkJs.plonk.exportSolidityCallData(
        utils.unstringifyBigInts(depositProofData),
        []
      )
    ).split(",")[0];
  }

  async getProofs(inputs: any[], deps: ProofDep[]) {
    return await Promise.all(
      inputs.map(async (input, idx) => {
        const dep = deps[idx];
        return await this.getProof(input, dep);
      })
    );
  }

  async deposit({
    account,
    amount,
    debt,
    unitPerUnderlying,
    publicKey,
    accountCommitments,
  }: DepositParams) {
    const newAmount = account.amount.add(amount);
    const newDebt = account.debt.sub(debt);
    const newAccount = new Account({
      amount: newAmount.toString(),
      debt: newDebt.toString(),
    });

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

    const inputs = [
      {
        amount,
        debt,
        unitPerUnderlying,
        extDataHash,

        inputAmount: account.amount,
        inputDebt: account.debt,
        inputSecret: account.secret,
        inputNullifier: account.nullifier,
        inputSalt: account.salt,
        inputAccountHash: account.accountHash,

        outputAmount: newAccount.amount,
        outputDebt: newAccount.debt,
        outputSecret: newAccount.secret,
        outputNullifier: newAccount.nullifier,
        outputSalt: newAccount.salt,
        outputAccountHash: newAccount.accountHash,
      },
      {
        inputAmount: account.amount,
        inputDebt: account.debt,
        inputSecret: account.secret,
        inputNullifier: account.nullifier,
        inputSalt: account.salt,
        inputRoot: accountTreeUpdate.oldRoot,
        inputPathElements: accountPath.pathElements,
        inputPathIndices: bitsToNumber(accountPath.pathIndices),
        inputNullifierHash: account.nullifierHash,
        inputAccountHash: account.accountHash,
      },
      {
        inputRoot: accountTreeUpdate.oldRoot,

        outputAmount: newAccount.amount,
        outputDebt: newAccount.debt,
        outputSecret: newAccount.secret,
        outputNullifier: newAccount.nullifier,
        outputSalt: newAccount.salt,
        outputRoot: accountTreeUpdate.newRoot,
        outputPathIndices: accountTreeUpdate.pathIndices,
        outputPathElements: accountTreeUpdate.pathElements,
        outputCommitment: newAccount.commitment,
        outputAccountHash: newAccount.accountHash,
      },
    ];

    const proofs = await this.getProofs(inputs, [
      {
        getWasm: this.provingKeys.getDepositWasm,
        getZkey: this.provingKeys.getDepositZkey,
      },
      {
        getWasm: this.provingKeys.getInputRootWasm,
        getZkey: this.provingKeys.getInputRootZkey,
      },
      {
        getWasm: this.provingKeys.getOutputRootWasm,
        getZkey: this.provingKeys.getOutputRootZkey,
      },
    ]);

    const args = {
      amount: toFixedHex(amount),
      debt: toFixedHex(debt),
      unitPerUnderlying: toFixedHex(unitPerUnderlying),
      extDataHash,
      extData: {
        encryptedAccount,
      },
      account: {
        inputRoot: toFixedHex(accountTreeUpdate.oldRoot),
        inputNullifierHash: toFixedHex(account.nullifierHash),
        inputAccountHash: toFixedHex(account.accountHash),
        outputRoot: toFixedHex(accountTreeUpdate.newRoot),
        outputPathIndices: toFixedHex(accountTreeUpdate.pathIndices),
        outputCommitment: toFixedHex(newAccount.commitment),
        outputAccountHash: toFixedHex(newAccount.accountHash),
      },
    };

    return {
      proofs,
      args,
      account: newAccount,
    };
  }

  async withdraw({
    account,
    amount: withdrawAmount,
    debt,
    unitPerUnderlying,
    recipient,
    publicKey,
    fee = toBN(0),
    relayer = 0,
    accountCommitments,
  }: WithdrawParams) {
    const amount = withdrawAmount.add(fee);
    const newAmount = account.amount.sub(amount);
    const newDebt = account.debt.add(debt);
    const newAccount = new Account({
      amount: newAmount.toString(),
      debt: newDebt.toString(),
    });

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
    const extDataHash = getExtWithdrawArgsHash({
      fee,
      recipient,
      relayer,
      encryptedAccount,
    });

    const inputs = [
      {
        amount,
        debt,
        unitPerUnderlying,
        extDataHash,

        inputAmount: account.amount,
        inputDebt: account.debt,
        inputSecret: account.secret,
        inputNullifier: account.nullifier,
        inputSalt: account.salt,
        inputAccountHash: account.accountHash,

        outputAmount: newAccount.amount,
        outputDebt: newAccount.debt,
        outputSecret: newAccount.secret,
        outputNullifier: newAccount.nullifier,
        outputSalt: newAccount.salt,
        outputAccountHash: newAccount.accountHash,
      },
      {
        inputAmount: account.amount,
        inputDebt: account.debt,
        inputSecret: account.secret,
        inputNullifier: account.nullifier,
        inputSalt: account.salt,
        inputRoot: accountTreeUpdate.oldRoot,
        inputPathElements: accountPath.pathElements,
        inputPathIndices: bitsToNumber(accountPath.pathIndices),
        inputNullifierHash: account.nullifierHash,
        inputAccountHash: account.accountHash,
      },
      {
        inputRoot: accountTreeUpdate.oldRoot,

        outputAmount: newAccount.amount,
        outputDebt: newAccount.debt,
        outputSecret: newAccount.secret,
        outputNullifier: newAccount.nullifier,
        outputSalt: newAccount.salt,
        outputRoot: accountTreeUpdate.newRoot,
        outputPathIndices: accountTreeUpdate.pathIndices,
        outputPathElements: accountTreeUpdate.pathElements,
        outputCommitment: newAccount.commitment,
        outputAccountHash: newAccount.accountHash,
      },
    ];

    const proofs = await this.getProofs(inputs, [
      {
        getWasm: this.provingKeys.getWithdrawWasm,
        getZkey: this.provingKeys.getWithdrawZkey,
      },
      {
        getWasm: this.provingKeys.getInputRootWasm,
        getZkey: this.provingKeys.getInputRootZkey,
      },
      {
        getWasm: this.provingKeys.getOutputRootWasm,
        getZkey: this.provingKeys.getOutputRootZkey,
      },
    ]);

    const args = {
      amount: toFixedHex(amount),
      debt: toFixedHex(debt),
      unitPerUnderlying: toFixedHex(unitPerUnderlying),
      extDataHash,
      extData: {
        fee: toFixedHex(fee),
        relayer: toFixedHex(relayer, 20),
        recipient: toFixedHex(recipient, 20),
        encryptedAccount,
      },
      account: {
        inputRoot: toFixedHex(accountTreeUpdate.oldRoot),
        inputNullifierHash: toFixedHex(account.nullifierHash),
        inputAccountHash: toFixedHex(account.accountHash),
        outputRoot: toFixedHex(accountTreeUpdate.newRoot),
        outputPathIndices: toFixedHex(accountTreeUpdate.pathIndices),
        outputCommitment: toFixedHex(newAccount.commitment),
        outputAccountHash: toFixedHex(newAccount.accountHash),
      },
    };

    return {
      proofs,
      args,
      account: newAccount,
    };
  }

  async treeUpdate(commitment: any, accountTree: any) {
    const accountTreeUpdate = this._updateTree(accountTree, commitment);

    const input = {
      oldRoot: accountTreeUpdate.oldRoot,
      newRoot: accountTreeUpdate.newRoot,
      leaf: commitment,
      pathIndices: accountTreeUpdate.pathIndices,
      pathElements: accountTreeUpdate.pathElements,
    };

    const { proof: proofData } = await this.getSnarkJs().plonk.fullProve(
      utils.stringifyBigInts(input),
      this.provingKeys.getTreeUpdateWasm(),
      this.provingKeys.getTreeUpdateZkey()
    );
    const [proof] = (
      await this.getSnarkJs().plonk.exportSolidityCallData(
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
