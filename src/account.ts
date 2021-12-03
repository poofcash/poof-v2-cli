import { toBN } from "web3-utils";
import { encrypt, decrypt, EthEncryptedData } from "eth-sig-util";
import { randomBN, poseidonHash } from "./utils";
import BN from "bn.js";

export class Account {
  public amount: BN;
  public debt: BN;
  public secret: BN;
  public nullifier: BN;
  public salt: BN;
  public accountIdx?: BN;
  public previousAccountIdx?: BN;

  public accountHash: BN;
  public commitment: BN;
  public nullifierHash: BN;

  constructor({
    amount,
    debt,
    secret,
    nullifier,
    accountIdx,
    previousAccountIdx,
  }: {
    amount?: string;
    debt?: string;
    secret?: string;
    nullifier?: string;
    accountIdx?: number;
    previousAccountIdx?: string | number;
  } = {}) {
    this.amount = amount ? toBN(amount.toString()) : toBN("0");
    this.debt = debt ? toBN(debt.toString()) : toBN("0");
    this.secret = secret ? toBN(secret.toString()) : randomBN(31);
    this.nullifier = nullifier ? toBN(nullifier.toString()) : randomBN(31);
    this.accountIdx = accountIdx ? toBN(accountIdx) : undefined;
    this.previousAccountIdx = previousAccountIdx
      ? toBN(previousAccountIdx)
      : undefined;
    this.salt = randomBN(31);

    this.commitment = poseidonHash([
      this.amount,
      this.debt,
      this.secret,
      this.nullifier,
    ]);
    this.accountHash = poseidonHash([
      this.amount,
      this.debt,
      this.secret,
      this.nullifier,
      this.salt,
    ]);
    this.nullifierHash = poseidonHash([this.nullifier]);

    if (this.amount.lt(toBN(0))) {
      throw new Error("Cannot create an account with negative amount");
    }
    if (this.debt.lt(toBN(0))) {
      throw new Error("Cannot create an account with a negative debt");
    }
  }

  encrypt(pubkey: string) {
    const bytes = Buffer.concat([
      this.amount.toBuffer("be", 31),
      this.debt.toBuffer("be", 31),
      this.secret.toBuffer("be", 31),
      this.nullifier.toBuffer("be", 31),
      ...(this.previousAccountIdx
        ? [this.previousAccountIdx.toBuffer("be", 31)]
        : []),
    ]);
    return encrypt(
      pubkey,
      { data: bytes.toString("base64") },
      "x25519-xsalsa20-poly1305"
    );
  }

  static decrypt(privkey: string, data: EthEncryptedData, accountIdx: number) {
    const decryptedMessage = decrypt(data, privkey);
    const buf = Buffer.from(decryptedMessage, "base64");
    return new Account({
      amount: "0x" + buf.slice(0, 31).toString("hex"),
      debt: "0x" + buf.slice(31, 62).toString("hex"),
      secret: "0x" + buf.slice(62, 93).toString("hex"),
      nullifier: "0x" + buf.slice(93, 124).toString("hex"),
      accountIdx,
      previousAccountIdx:
        buf.length > 124
          ? "0x" + buf.slice(124, 155).toString("hex")
          : undefined,
    });
  }
}
