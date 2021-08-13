import Web3 from "web3";
import BN from "bn.js";
import { randomBytes } from "crypto";
import { bigInt } from "snarkjs";
import { babyJub, pedersenHash, mimcsponge, poseidon } from "circomlib";
import { fromWei, toWei, toBN, soliditySha3 } from "web3-utils";

const web3 = new Web3();
const rbigint = (nbytes: number) => bigInt.leBuff2int(randomBytes(nbytes));

const inBrowser = typeof window !== "undefined";
if (!inBrowser) {
  global.fetch = require("node-fetch");
}

declare global {
  interface Window {
    genZKSnarkProofAndWitness: any;
  }
}

export type Deposit = {
  preimage: Buffer;
  nullifier: BigInt;
  secret: BigInt;
  secretHex: string;
  commitment: BN;
  commitmentHex: string;
  nullifierHash: BN;
  nullifierHex: string;
};

// Generates a deposit from a nullifier and secret
export const createDeposit = (nullifier: any, secret: any): Deposit => {
  const preimage = Buffer.concat([
    nullifier.leInt2Buff(31),
    secret.leInt2Buff(31),
  ]);
  const commitment = pedersenHashBuffer(preimage);
  const nullifierHash = pedersenHashBuffer(nullifier.leInt2Buff(31));
  const commitmentHex = toHex(commitment);
  const nullifierHex = toHex(nullifierHash);
  const secretHex = toHex(secret);
  return {
    nullifier,
    secret,
    preimage,
    commitment,
    nullifierHash,
    commitmentHex,
    nullifierHex,
    secretHex,
  };
};

// BigNumber to hex string of specified length
export const toHex = (
  num: BigInt | BN | Buffer | number | string,
  length = 32
) =>
  "0x" +
  (num instanceof Buffer
    ? num.toString("hex")
    : toBN(num.toString()).toString(16)
  ).padStart(length * 2, "0");

// Generate a new note string with a random nullifier and secret
export const generateNewNoteString = (
  currency: string,
  amount: string,
  netId: number
) => {
  const nullifier = rbigint(31);
  const secret = rbigint(31);
  // get snarks note and commitment
  const preimage = Buffer.concat([
    nullifier.leInt2Buff(31),
    secret.leInt2Buff(31),
  ]);
  const note: string = toHex(preimage, 62);
  const noteString: string = `poof-${currency}-${amount}-${netId}-${note}`;
  return noteString;
};

export const isValidNote = (noteString: string) => {
  const noteRegex =
    /poof-(?<currency>\w+)-(?<amount>[\d.]+)-(?<netId>\d+)-0x(?<note>[0-9a-fA-F]{124})/g;
  let match = noteRegex.exec(noteString);
  return Boolean(match);
};

/**
 * Parses Poof.cash note
 * @param noteString the note
 */
export const parseNote = (noteString: string) => {
  if (!isValidNote(noteString)) {
    return {};
  }
  const noteRegex =
    /poof-(?<currency>\w+)-(?<amount>[\d.]+)-(?<netId>\d+)-0x(?<note>[0-9a-fA-F]{124})/g;
  let match = noteRegex.exec(noteString);
  if (!match) {
    throw new Error("The note has invalid format");
  }

  let matchGroup: any = match.groups;
  const buf = Buffer.from(matchGroup.note, "hex");
  const nullifier = bigInt.leBuff2int(buf.slice(0, 31));
  const secret = bigInt.leBuff2int(buf.slice(31, 62));
  const deposit = createDeposit(nullifier, secret);
  const netId = Number(matchGroup.netId);

  return {
    currency: matchGroup.currency,
    amount: matchGroup.amount,
    netId,
    deposit: deposit,
  };
};

// @gasPrice Price of gas in gwei
// @amount Amount to transact in normal amount
// @refund Amount of buffered gas in wei
// @currencyCeloPrice Prices relative to CELO of the currency to transact
// @poofServiceFee Number between [0,100] representing relayer fee in percent
// @decimals Number of decimals in the currency to transact
// @gasLimit Max amount of gas in wei
// @return Fee in the transaction currency (in wei for 18 decimals)
export const calculateFee = (
  gasPrice: string | number,
  amount: string | number,
  refund: string | number,
  currencyCeloPrice: string | number,
  poofServiceFee: string | number,
  decimals: string | number,
  gasLimit: string | number
) => {
  gasPrice = gasPrice.toString();
  amount = amount.toString();
  refund = refund.toString();
  currencyCeloPrice = currencyCeloPrice.toString();
  poofServiceFee = poofServiceFee.toString();
  decimals = decimals.toString();
  gasLimit = gasLimit.toString();

  const toDecimals = (v: string) =>
    toBN(fromWei(toBN(toWei(v)).mul(toBN(10).pow(toBN(decimals)))));

  const relayerFee = toDecimals(amount.toString())
    .mul(toDecimals(poofServiceFee.toString()))
    .div(toDecimals("100"));
  const gas = toBN(toWei(gasPrice.toString(), "gwei")).mul(toBN(gasLimit));
  const gasInCurrency = toDecimals(gas.add(toBN(refund)).toString()).div(
    toBN(toWei(currencyCeloPrice.toString()))
  );

  return gasInCurrency.add(relayerFee);
};

export const DepositExtData = {
  DepositExtData: {
    encryptedAccount: "bytes",
  },
};

export const AccountUpdate = {
  AccountUpdate: {
    inputRoot: "bytes32",
    inputNullifierHash: "bytes32",
    outputRoot: "bytes32",
    outputPathIndices: "uint256",
    outputCommitment: "bytes32",
  },
};

export const DepositArgs = {
  DepositArgs: {
    rate: "uint256",
    fee: "uint256",
    instance: "address",
    rewardNullifier: "bytes32",
    extDataHash: "bytes32",
    depositRoot: "bytes32",
    withdrawalRoot: "bytes32",
    extData: DepositExtData.DepositExtData,
    account: AccountUpdate.AccountUpdate,
  },
};

export const WithdrawExtData = {
  WithdrawExtData: {
    fee: "uint256",
    recipient: "address",
    relayer: "address",
    encryptedAccount: "bytes",
  },
};

export const pedersenHashBuffer = (buffer) =>
  toBN(babyJub.unpackPoint(pedersenHash.hash(buffer))[0].toString());

export const mimcHash = (items) =>
  toBN(mimcsponge.multiHash(items.map((item) => bigInt(item))).toString());

export const poseidonHash = (items) => toBN(poseidon(items).toString());

export const poseidonHash2 = (a, b) => poseidonHash([a, b]);

/** Generate random number of specified byte length */
export const randomBN = (nbytes = 31) =>
  toBN(bigInt.leBuff2int(randomBytes(nbytes)).toString());

/** BigNumber to hex string of specified length */
export const toFixedHex = (num, length = 32) =>
  "0x" +
  (num instanceof Buffer
    ? num.toString("hex")
    : bigInt(num).toString(16)
  ).padStart(length * 2, "0");

export function getExtDepositArgsHash({ encryptedAccount }) {
  const encodedData = web3.eth.abi.encodeParameters(
    [DepositExtData],
    [{ encryptedAccount }]
  );
  const hash = soliditySha3({ t: "bytes", v: encodedData });
  return "0x00" + hash.slice(4); // cut last byte to make it 31 byte long to fit the snark field
}

export function getExtWithdrawArgsHash({
  fee,
  recipient,
  relayer,
  encryptedAccount,
}) {
  const encodedData = web3.eth.abi.encodeParameters(
    [WithdrawExtData],
    [
      {
        fee: toFixedHex(fee, 32),
        recipient: toFixedHex(recipient, 20),
        relayer: toFixedHex(relayer, 20),
        encryptedAccount,
      },
    ]
  );
  const hash = soliditySha3({ t: "bytes", v: encodedData });
  return "0x00" + hash.slice(4); // cut first byte to make it 31 byte long to fit the snark field
}

export function packEncryptedMessage(encryptedMessage) {
  const nonceBuf = Buffer.from(encryptedMessage.nonce, "base64");
  const ephemPublicKeyBuf = Buffer.from(
    encryptedMessage.ephemPublicKey,
    "base64"
  );
  const ciphertextBuf = Buffer.from(encryptedMessage.ciphertext, "base64");
  const messageBuff = Buffer.concat([
    Buffer.alloc(24 - nonceBuf.length),
    nonceBuf,
    Buffer.alloc(32 - ephemPublicKeyBuf.length),
    ephemPublicKeyBuf,
    ciphertextBuf,
  ]);
  return "0x" + messageBuff.toString("hex");
}

export function unpackEncryptedMessage(encryptedMessage) {
  if (encryptedMessage.slice(0, 2) === "0x") {
    encryptedMessage = encryptedMessage.slice(2);
  }
  const messageBuff = Buffer.from(encryptedMessage, "hex");
  const nonceBuf = messageBuff.slice(0, 24);
  const ephemPublicKeyBuf = messageBuff.slice(24, 56);
  const ciphertextBuf = messageBuff.slice(56);
  return {
    version: "x25519-xsalsa20-poly1305",
    nonce: nonceBuf.toString("base64"),
    ephemPublicKey: ephemPublicKeyBuf.toString("base64"),
    ciphertext: ciphertextBuf.toString("base64"),
  };
}

export function bitsToNumber(bits) {
  let result = 0;
  for (const item of bits.slice().reverse()) {
    result = (result << 1) + item;
  }
  return result;
}
