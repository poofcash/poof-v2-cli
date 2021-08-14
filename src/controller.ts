import { toBN } from "web3-utils";
import {
  bitsToNumber,
  toFixedHex,
  poseidonHash2,
  getExtDepositArgsHash,
  getExtWithdrawArgsHash,
  packEncryptedMessage,
} from "./utils";
import { EventData } from "web3-eth-contract";
import { Account } from "./account";
import MerkleTree from "fixed-merkle-tree";
import { Address } from "@celo/contractkit";
import websnarkUtils from "websnark/src/utils";
import BN from "bn.js";
import { Poof } from "./generated/Poof";

type DepositParams = {
  account: Account;
  publicKey: string;
  amount: BN;
  accountCommitments?: BN[];
};

type WithdrawParams = {
  account: Account;
  amount: BN;
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
  private groth16: any;

  constructor({ merkleTreeHeight = 20, provingKeys, groth16 }) {
    this.merkleTreeHeight = Number(merkleTreeHeight);
    this.provingKeys = provingKeys;
    this.groth16 = groth16;
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
    { account, amount, publicKey, accountCommitments }: DepositParams
  ) {
    const newAmount = account.amount.add(amount);
    const newAccount = new Account({ amount: newAmount.toString() });

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
      extDataHash,

      inputAmount: account.amount,
      inputSecret: account.secret,
      inputNullifier: account.nullifier,
      inputRoot: accountTreeUpdate.oldRoot,
      inputPathElements: accountPath.pathElements,
      inputPathIndices: bitsToNumber(accountPath.pathIndices),
      inputNullifierHash: account.nullifierHash,

      outputAmount: newAccount.amount,
      outputSecret: newAccount.secret,
      outputNullifier: newAccount.nullifier,
      outputRoot: accountTreeUpdate.newRoot,
      outputPathIndices: accountTreeUpdate.pathIndices,
      outputPathElements: accountTreeUpdate.pathElements,
      outputCommitment: newAccount.commitment,
    };

    const proofData = await websnarkUtils.genWitnessAndProve(
      this.groth16,
      input,
      this.provingKeys.depositCircuit,
      this.provingKeys.depositProvingKey
    );
    const { proof } = websnarkUtils.toSolidityInput(proofData);

    const args = {
      amount: toFixedHex(amount),
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
      amount,
      recipient,
      publicKey,
      fee = toBN(0),
      relayer = 0,
      accountCommitments,
    }: WithdrawParams
  ) {
    const newAmount = account.amount.sub(amount);
    const newAccount = new Account({ amount: newAmount.toString() });

    accountCommitments =
      accountCommitments || (await fetchAccountCommitments(poof));
    const accountTree = new MerkleTree(
      this.merkleTreeHeight,
      accountCommitments,
      {
        hashFunction: poseidonHash2,
      }
    );
    const accountIndex = accountTree.indexOf(
      account.commitment,
      (a: any, b: any) => a.eq(b)
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

    const input = {
      amount: amount,
      extDataHash,

      inputAmount: account.amount,
      inputSecret: account.secret,
      inputNullifier: account.nullifier,
      inputNullifierHash: account.nullifierHash,
      inputRoot: accountTreeUpdate.oldRoot,
      inputPathIndices: bitsToNumber(accountPath.pathIndices),
      inputPathElements: accountPath.pathElements,

      outputAmount: newAccount.amount,
      outputSecret: newAccount.secret,
      outputNullifier: newAccount.nullifier,
      outputRoot: accountTreeUpdate.newRoot,
      outputPathIndices: accountTreeUpdate.pathIndices,
      outputPathElements: accountTreeUpdate.pathElements,
      outputCommitment: newAccount.commitment,
    };

    const proofData = await websnarkUtils.genWitnessAndProve(
      this.groth16,
      input,
      this.provingKeys.withdrawCircuit,
      this.provingKeys.withdrawProvingKey
    );
    const { proof } = websnarkUtils.toSolidityInput(proofData);

    const args = {
      amount: toFixedHex(input.amount),
      extDataHash: toFixedHex(input.extDataHash),
      extData: {
        fee: toFixedHex(fee),
        recipient: toFixedHex(recipient, 20),
        relayer: toFixedHex(relayer, 20),
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

    const proofData = await websnarkUtils.genWitnessAndProve(
      this.groth16,
      input,
      this.provingKeys.treeUpdateCircuit,
      this.provingKeys.treeUpdateProvingKey
    );
    const { proof } = websnarkUtils.toSolidityInput(proofData);

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
