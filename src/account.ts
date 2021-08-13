import { toBN } from "web3-utils";
import { encrypt, decrypt, EthEncryptedData } from "eth-sig-util";
import { randomBN, poseidonHash } from "./utils";
import BN from "bn.js";

export class Account {
  public amount: BN;
  public secret: BN;
  public nullifier: BN;
  public commitment: BN;
  public nullifierHash: BN;

  constructor({
    amount,
    secret,
    nullifier,
  }: { amount?: string; secret?: string; nullifier?: string } = {}) {
    this.amount = amount ? toBN(amount.toString()) : toBN("0");
    this.secret = secret ? toBN(secret.toString()) : randomBN(31);
    this.nullifier = nullifier ? toBN(nullifier.toString()) : randomBN(31);

    this.commitment = poseidonHash([this.amount, this.secret, this.nullifier]);
    this.nullifierHash = poseidonHash([this.nullifier]);

    if (this.amount.lt(toBN(0))) {
      throw new Error("Cannot create an account with negative amount");
    }
  }

  encrypt(pubkey: string) {
    const bytes = Buffer.concat([
      this.amount.toBuffer("be", 31),
      this.secret.toBuffer("be", 31),
      this.nullifier.toBuffer("be", 31),
    ]);
    return encrypt(
      pubkey,
      { data: bytes.toString("base64") },
      "x25519-xsalsa20-poly1305"
    );
  }

  static decrypt(privkey: string, data: EthEncryptedData) {
    const decryptedMessage = decrypt(data, privkey);
    const buf = Buffer.from(decryptedMessage, "base64");
    return new Account({
      amount: "0x" + buf.slice(0, 31).toString("hex"),
      secret: "0x" + buf.slice(31, 62).toString("hex"),
      nullifier: "0x" + buf.slice(62, 93).toString("hex"),
    });
  }
}
