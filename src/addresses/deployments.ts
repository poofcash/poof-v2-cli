type CurrencyEntry = {
  poolAddress: string;
  tokenAddress: string;
  wrappedAddress?: string;
  symbol: string;
  pSymbol: string;
  decimals: 18;
};

export const deployments: Record<string | number, Array<CurrencyEntry>> = {
  42220: [
    {
      poolAddress: "0xfB47887aB99B714959818aB8F92269e3CD494D72",
      tokenAddress: "0x471EcE3750Da237f93B8E339c536989b8978a438",
      wrappedAddress: "0x9bBC688F87D6D3d8047c8b8020673cB1d357D94b",
      symbol: "CELO",
      pSymbol: "pCELO",
      decimals: 18,
    },
    {
      poolAddress: "0xD540b88515a38d84681B6D77B12Cd22152df608d",
      tokenAddress: "0x765DE816845861e75A25fCA122bb6898B8B1282a",
      wrappedAddress: "0x9038AF22C951E51C531a90208271F4117CB727e6",
      symbol: "cUSD",
      pSymbol: "pUSD",
      decimals: 18,
    },
    {
      poolAddress: "0xf27fbEfc58f9f73159Db249F5749B41819587c66",
      tokenAddress: "0xa8d0E6799FF3Fd19c6459bf02689aE09c4d78Ba7",
      wrappedAddress: "0xA2C5FABf23D40fb1D1E784B826f4F86F82b3874d",
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
};
