declare module "snarkjs" {
  declare const original: any;
  declare const groth: any;
  declare const kimleeoh: any;
  declare module bigInt {
    declare function leBuff2int(buff: Buffer): bigInt;
    declare function leInt2Buff(len: number): bigInt;
  }
  declare function bigInt(v: string | number): bigInt;
  declare const ZqField: any;

  declare const stringifyBigInts: any;
  declare const unstringifyBigInts: any;
}
