export enum ProvingSystem {
  GROTH16,
  PLONK,
}

type Pool = {
  poolAddress: string;
  tokenAddress?: string;
  pTokenAddress?: string;
  symbol: string;
  pSymbol: string;
  decimals: number;
  creationBlock: number;
  provingSystem: ProvingSystem;
  merkleTreeHeight: number;
};

const v1Deployment = ({
  poolAddress,
  tokenAddress,
  pTokenAddress,
  symbol,
  pSymbol,
  decimals,
  creationBlock,
}: Partial<Pool>): Pool => {
  return {
    poolAddress,
    tokenAddress,
    pTokenAddress,
    symbol: `${symbol}_v1`,
    pSymbol: `${pSymbol}_v1`,
    decimals,
    creationBlock,
    provingSystem: ProvingSystem.PLONK,
    merkleTreeHeight: 20,
  };
};

const v2Deployment = ({
  poolAddress,
  tokenAddress = undefined,
  pTokenAddress,
  symbol,
  pSymbol,
  decimals,
  creationBlock,
}): Pool => {
  return {
    poolAddress,
    tokenAddress,
    pTokenAddress,
    symbol: `${symbol}_v2`,
    pSymbol: `${pSymbol}_v2`,
    decimals,
    creationBlock,
    provingSystem: ProvingSystem.GROTH16,
    merkleTreeHeight: 24,
  };
};

export const deployments: Record<string | number, Array<Pool>> = {
  42220: [
    v2Deployment({
      poolAddress: "0x5e1a05E9797aB64841792Bcd320D0EFDB1Ab70ac",
      tokenAddress: "0x471EcE3750Da237f93B8E339c536989b8978a438",
      pTokenAddress: "0x301a61D01A63c8D670c2B8a43f37d12eF181F997",
      symbol: "CELO",
      pSymbol: "pCELO",
      decimals: 18,
      creationBlock: 9419623,
    }),
    v2Deployment({
      poolAddress: "0xbd5c0877b524eEA37B48E67C012bcE1916EA3F97",
      tokenAddress: "0x765DE816845861e75A25fCA122bb6898B8B1282a",
      pTokenAddress: "0xEadf4A7168A82D30Ba0619e64d5BCf5B30B45226",
      symbol: "cUSD",
      pSymbol: "pUSD",
      decimals: 18,
      creationBlock: 9419624,
    }),
    v2Deployment({
      poolAddress: "0x8F29EB2A9Dc44cb1A4FFeD64EDa398Aba34BAEd0",
      tokenAddress: "0xd8763cba276a3738e6de85b4b3bf5fded6d6ca73",
      pTokenAddress: "0xD8761DD6c7cB54febD33adD699F5E4440b62E01B",
      symbol: "cEUR",
      pSymbol: "pEUR",
      decimals: 18,
      creationBlock: 9419625,
    }),
    v2Deployment({
      poolAddress: "0x2A842A5C2BBb45a321Babd2F00D9D3E513d7b642",
      tokenAddress: "0xe8537a3d056DA446677B9E9d6c5dB704EaAb4787",
      pTokenAddress: "0x51d1D8F59CfDF12a5a54892AEdB1eE1683a6d8B6",
      symbol: "cREAL",
      pSymbol: "pREAL",
      decimals: 18,
      creationBlock: 11507382,
    }),
    v1Deployment({
      poolAddress: "0xE74AbF23E1Fdf7ACbec2F3a30a772eF77f1601E1",
      tokenAddress: "0x471EcE3750Da237f93B8E339c536989b8978a438",
      pTokenAddress: "0xE74AbF23E1Fdf7ACbec2F3a30a772eF77f1601E1",
      symbol: "CELO",
      pSymbol: "pCELO",
      decimals: 18,
      creationBlock: 9419623,
    }),
    v1Deployment({
      poolAddress: "0xB4aa2986622249B1F45eb93F28Cfca2b2606d809",
      tokenAddress: "0x765DE816845861e75A25fCA122bb6898B8B1282a",
      pTokenAddress: "0xB4aa2986622249B1F45eb93F28Cfca2b2606d809",
      symbol: "cUSD",
      pSymbol: "pUSD",
      decimals: 18,
      creationBlock: 9419624,
    }),
    v1Deployment({
      poolAddress: "0x56072D4832642dB29225dA12d6Fd1290E4744682",
      tokenAddress: "0xd8763cba276a3738e6de85b4b3bf5fded6d6ca73",
      pTokenAddress: "0x56072D4832642dB29225dA12d6Fd1290E4744682",
      symbol: "cEUR",
      pSymbol: "pEUR",
      decimals: 18,
      creationBlock: 9419625,
    }),
  ],
  44787: [
    v2Deployment({
      poolAddress: "0x149eB1EFDB1e75b00dB6d3865CE9E04F7a6D885E",
      tokenAddress: "0xF194afDf50B03e69Bd7D057c1Aa9e10c9954E4C9",
      pTokenAddress: "0x405a5c1cA9374Ca5F76a4829c6C764Dadecd2419",
      symbol: "CELO",
      pSymbol: "pCELO",
      decimals: 18,
      creationBlock: 7863536,
    }),
    v2Deployment({
      poolAddress: "0x0361cb7b746e23b15Ee33c627dCfb2c583Ff9738",
      tokenAddress: "0x874069Fa1Eb16D44d622F2e0Ca25eeA172369bC1",
      pTokenAddress: "0xeB1e6776d198cd53A91451dd29A78Dd7f5F4C136",
      symbol: "cUSD",
      pSymbol: "pUSD",
      decimals: 18,
      creationBlock: 7863537,
    }),
    v2Deployment({
      poolAddress: "0x9DC31b533a95FaDC87632034B2baEf216f7f5e93",
      tokenAddress: "0x10c892A6EC43a53E45D0B916B4b7D383B1b78C0F",
      pTokenAddress: "0xa7260929f57D356723739fF6EB3dF80c0e0A8A33",
      symbol: "cEUR",
      pSymbol: "pEUR",
      decimals: 18,
      creationBlock: 7863538,
    }),
    v2Deployment({
      poolAddress: "0xc8Af82Fea43EA4BfAB210E3AF8D42f8C8756AEAb",
      tokenAddress: "0xE4D517785D091D3c54818832dB6094bcc2744545",
      pTokenAddress: "0xdd1fC5AED8b2CeF7fd69160cfBF9F9D2F0C6BE1a",
      symbol: "cREAL",
      pSymbol: "pREAL",
      decimals: 18,
      creationBlock: 9951776,
    }),
  ],
  4002: [
    v1Deployment({
      poolAddress: "0x56072D4832642dB29225dA12d6Fd1290E4744682",
      pTokenAddress: "0x56072D4832642dB29225dA12d6Fd1290E4744682",
      symbol: "FTM",
      pSymbol: "pFTM",
      decimals: 18,
      creationBlock: 4449905,
    }),
  ],
  250: [
    v1Deployment({
      poolAddress: "0xAdfC2a82becC26C48ed0d1A06C813d283cB39006",
      pTokenAddress: "0xAdfC2a82becC26C48ed0d1A06C813d283cB39006",
      symbol: "FTM",
      pSymbol: "pFTM",
      decimals: 18,
      creationBlock: 19546119,
    }),
  ],
  80001: [
    v1Deployment({
      poolAddress: "0x0C171f145Ce7570cc94Cfc39b6f219F4C2d3eFCf", // 0xD368d1195dE89f189641B9609273e10248A7B641
      pTokenAddress: "0x0C171f145Ce7570cc94Cfc39b6f219F4C2d3eFCf", // 0xD368d1195dE89f189641B9609273e10248A7B641
      symbol: "MATIC",
      pSymbol: "pMATIC",
      decimals: 18,
      creationBlock: 20543511,
    }),
  ],
  137: [
    v1Deployment({
      poolAddress: "0xEfc83b8EfCc03cC2ECc28C542A7bf4D9e4Ce9a6E", // 0xbf03e0f7D8dFB17e4680C4D4748A614968aD5495
      pTokenAddress: "0xEfc83b8EfCc03cC2ECc28C542A7bf4D9e4Ce9a6E", // 0xbf03e0f7D8dFB17e4680C4D4748A614968aD5495
      symbol: "MATIC",
      pSymbol: "pMATIC",
      decimals: 18,
      creationBlock: 20568728,
    }),
  ],
  43113: [
    v2Deployment({
      poolAddress: "0xe34b0DC9CbF083E877C40Ebd1F54092E078D5753", // 0xCB6b9b4b2D519c0ADdE2142Cc695464c39369aB4
      pTokenAddress: "0x7F1A67C7321b3d640b514eC9a6642C743669DF4D", // 0xCB6b9b4b2D519c0ADdE2142Cc695464c39369aB4
      symbol: "AVAX",
      pSymbol: "pAVAX",
      decimals: 18,
      creationBlock: 3103989,
    }),
    v1Deployment({
      poolAddress: "0x0824C3Ed3bF48E5A0dB14c36a1fa44D68f0D79AC", // 0xCB6b9b4b2D519c0ADdE2142Cc695464c39369aB4
      pTokenAddress: "0x0824C3Ed3bF48E5A0dB14c36a1fa44D68f0D79AC", // 0xCB6b9b4b2D519c0ADdE2142Cc695464c39369aB4
      symbol: "AVAX",
      pSymbol: "pAVAX",
      decimals: 18,
      creationBlock: 2163000,
    }),
  ],
  43114: [
    v2Deployment({
      poolAddress: "0x337ddAD7Fcb34E93a54a7B6df7C8Bae00fA91D09", // 0x71003CE2353C91E05293444A9C3225997CcD353C
      pTokenAddress: "0xC7D074C525f04B39f21e6f8C84c9FeFcC980f49D", // 0x71003CE2353C91E05293444A9C3225997CcD353C
      symbol: "AVAX",
      pSymbol: "pAVAX",
      decimals: 18,
      creationBlock: 7775722,
    }),
    v1Deployment({
      poolAddress: "0xbf03e0f7D8dFB17e4680C4D4748A614968aD5495", // 0x71003CE2353C91E05293444A9C3225997CcD353C
      pTokenAddress: "0xbf03e0f7D8dFB17e4680C4D4748A614968aD5495", // 0x71003CE2353C91E05293444A9C3225997CcD353C
      symbol: "AVAX",
      pSymbol: "pAVAX",
      decimals: 18,
      creationBlock: 6053349,
    }),
  ],
  42: [
    v1Deployment({
      poolAddress: "0xD8761DD6c7cB54febD33adD699F5E4440b62E01B", // 0xbd5c0877b524eEA37B48E67C012bcE1916EA3F97
      pTokenAddress: "0xD8761DD6c7cB54febD33adD699F5E4440b62E01B", // 0xbd5c0877b524eEA37B48E67C012bcE1916EA3F97
      symbol: "ETH",
      pSymbol: "pETH",
      decimals: 18,
      creationBlock: 27944314,
    }),
  ],
  1: [
    v1Deployment({
      poolAddress: "0xd3020655F6431C9aF80fdAab66Da8Ac86abE365E", // 0x7580345EBC7DEFD34fC886CbD5Ffb1aDEbf2f6D6
      pTokenAddress: "0xd3020655F6431C9aF80fdAab66Da8Ac86abE365E", // 0x7580345EBC7DEFD34fC886CbD5Ffb1aDEbf2f6D6
      symbol: "ETH",
      pSymbol: "pETH",
      decimals: 18,
      creationBlock: 13487348,
    }),
  ],
};
