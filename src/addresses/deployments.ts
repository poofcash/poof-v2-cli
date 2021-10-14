type CurrencyEntry = {
  poolAddress: string;
  tokenAddress?: string;
  wrappedAddress?: string;
  symbol: string;
  pSymbol: string;
  decimals: 18;
};

export const deployments: Record<string | number, Array<CurrencyEntry>> = {
  42220: [
    {
      poolAddress: "0x7015A9e168a2Dc8Ef2afdABb7dD3b47F8E83d07A",
      tokenAddress: "0x471EcE3750Da237f93B8E339c536989b8978a438",
      wrappedAddress: "0xe3305d2c398B6AD1f2228621154a3Daf2a47f478",
      symbol: "CELO",
      pSymbol: "pCELO",
      decimals: 18,
    },
    {
      poolAddress: "0xba13bD87671fA4Ff861D1dE16F751784027be09b",
      tokenAddress: "0x765DE816845861e75A25fCA122bb6898B8B1282a",
      wrappedAddress: "0xC21984be83Af1e000ab04f63b61E0866Cb01e686",
      symbol: "cUSD",
      pSymbol: "pUSD",
      decimals: 18,
    },
    {
      poolAddress: "0xb789eB26B60585D91BafD8927189cc17b820D3C2",
      tokenAddress: "0xd8763cba276a3738e6de85b4b3bf5fded6d6ca73",
      wrappedAddress: "0x99319f8d95110fb26171B98fE24Af088f981c650",
      symbol: "cEUR",
      pSymbol: "pEUR",
      decimals: 18,
    },
  ],
  44787: [
    {
      poolAddress: "0x0Fe5Eb089AD8A8016E273036cc8872af527C4365",
      tokenAddress: "0xF194afDf50B03e69Bd7D057c1Aa9e10c9954E4C9",
      wrappedAddress: "0xa16663e35ab432bdB4dBB623f86AD395A3f90BA2",
      symbol: "CELO",
      pSymbol: "pCELO",
      decimals: 18,
    },
    {
      poolAddress: "0xe2092Cf167856668D070751ac8Ba1E014234ECc7",
      tokenAddress: "0x874069Fa1Eb16D44d622F2e0Ca25eeA172369bC1",
      wrappedAddress: "0x005603E4b5e2AC5533F2F6a8AB16867F9CA13977",
      symbol: "cUSD",
      pSymbol: "pUSD",
      decimals: 18,
    },
    {
      poolAddress: "0x2Bf7E58deFe22342413f51bB746a429BBFBBd9De",
      tokenAddress: "0x10c892A6EC43a53E45D0B916B4b7D383B1b78C0F",
      wrappedAddress: "0x2eC0b1a93418fE3d7C1D43E85A8fbf95345bD947",
      symbol: "cEUR",
      pSymbol: "pEUR",
      decimals: 18,
    },
  ],
  4002: [
    {
      poolAddress: "0xE8977C8af7cCc1763d28fC9f7bb2B20237903F1b",
      symbol: "FTM",
      pSymbol: "pFTM",
      decimals: 18,
    },
  ],
};
