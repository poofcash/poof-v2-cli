import crypto from "crypto";
import bigInt from "big-integer";
import { toBN, soliditySha3, isBN, numberToHex, toWei } from "web3-utils";
import { babyJub, pedersenHash, mimcsponge, poseidon } from "circomlib";
import Web3 from "web3";
import BN from "bn.js";

declare global {
  namespace NodeJS {
    interface Global {
      fetch: any;
    }
  }
}

const web3 = new Web3();

const inBrowser = typeof window !== "undefined";
if (!inBrowser) {
  global.fetch = require("node-fetch");
}

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
    depositProofHash: "bytes32",
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
  toBN(`0x${crypto.randomBytes(nbytes).toString("hex")}`);

/** BigNumber to hex string of specified length */
export const toFixedHex = (number, length = 32) => {
  if (isBN(number)) {
    return (
      "0x" +
      numberToHex(number)
        .slice(2)
        .padStart(length * 2, "0")
    );
  } else if (number.toString().startsWith("0x")) {
    return (
      "0x" +
      number
        .toString()
        .slice(2)
        .padStart(length * 2, "0")
    );
  }
  return (
    "0x" +
    (number instanceof Buffer
      ? number.toString("hex")
      : bigInt(number).toString(16)
    ).padStart(length * 2, "0")
  );
};

export function getExtDepositArgsHash({ encryptedAccount }) {
  const encodedData = web3.eth.abi.encodeParameters(
    [DepositExtData],
    [{ encryptedAccount }]
  );
  const hash = soliditySha3({ t: "bytes", v: encodedData });
  return "0x00" + hash.slice(4); // cut last byte to make it 31 byte long to fit the snark field
}

export function getDepositProofHash(depositProof) {
  if (!depositProof) {
    return toFixedHex(0, 32);
  }
  const encodedData = web3.eth.abi.encodeParameters(["bytes"], [depositProof]);
  const hash = soliditySha3({ t: "bytes", v: encodedData });
  return "0x00" + hash.slice(4); // cut last byte to make it 31 byte long to fit the snark field
}

export function getExtWithdrawArgsHash({
  fee,
  recipient,
  relayer,
  depositProofHash,
  encryptedAccount,
}) {
  const encodedData = web3.eth.abi.encodeParameters(
    [WithdrawExtData],
    [
      {
        fee: toFixedHex(fee, 32),
        recipient: toFixedHex(recipient, 20),
        relayer: toFixedHex(relayer, 20),
        depositProofHash,
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

// @amount Amount to transact in currency units
// @currencyCeloPrice Prices relative to CELO of the currency to transact
// @poofServiceFee Number between [0,100] representing relayer fee in percent
// @gasLimit Max amount of gas in gwei
// @return Fee in the transaction currency (in wei for 18 decimals)
export const calculateFee = (
  amount: BN,
  currencyCeloPrice: number,
  poofServiceFee: number,
  gasLimit: number
) => {
  if (currencyCeloPrice <= 0) {
    throw new Error("Invalid `currencyCeloPrice`");
  }
  // NOTE: Decimals should be incorporated in `currencyCeloPrice`. E.g. if TT has 8 decimals, and 1 CELO = 1 TT,
  // Then `currencyCeloPrice` should be 1e10
  const PRECISION = 10000;
  const relayerFee = amount
    .mul(toBN(poofServiceFee * PRECISION))
    .div(toBN(PRECISION))
    .div(toBN(100));

  const gasInWei = toBN(toWei(gasLimit.toString(), "gwei"));
  const gasInCurrency =
    currencyCeloPrice > 1
      ? gasInWei.div(toBN(currencyCeloPrice))
      : gasInWei.div(toBN(Math.ceil(currencyCeloPrice) * PRECISION));

  return gasInCurrency.add(relayerFee);
};
