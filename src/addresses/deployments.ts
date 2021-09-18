type CurrencyEntry = {
  poolAddress: string;
  tokenAddress: string;
  wrappedAddress?: string;
  symbol: string;
  decimals: 18;
};

export const deployments: Record<string | number, Array<CurrencyEntry>> = {
  42220: [
    {
      poolAddress: "0xfB47887aB99B714959818aB8F92269e3CD494D72",
      tokenAddress: "0x471EcE3750Da237f93B8E339c536989b8978a438",
      wrappedAddress: "0x9bBC688F87D6D3d8047c8b8020673cB1d357D94b",
      symbol: "CELO",
      decimals: 18,
    },
    {
      poolAddress: "0xD540b88515a38d84681B6D77B12Cd22152df608d",
      tokenAddress: "0x765DE816845861e75A25fCA122bb6898B8B1282a",
      wrappedAddress: "0x9038AF22C951E51C531a90208271F4117CB727e6",
      symbol: "cUSD",
      decimals: 18,
    },
    {
      poolAddress: "0xf27fbEfc58f9f73159Db249F5749B41819587c66",
      tokenAddress: "0xa8d0E6799FF3Fd19c6459bf02689aE09c4d78Ba7",
      wrappedAddress: "0xA2C5FABf23D40fb1D1E784B826f4F86F82b3874d",
      symbol: "cEUR",
      decimals: 18,
    },
  ],
  44787: [
    {
      poolAddress: "0x9a5f7057B0ad93f29Fc7CDdeb592777dFb98d980",
      tokenAddress: "0xF194afDf50B03e69Bd7D057c1Aa9e10c9954E4C9",
      wrappedAddress: "0x7f1014687E35b78029Ed0d42AF31B2244B3C5191",
      symbol: "CELO",
      decimals: 18,
    },
    {
      poolAddress: "0x2B5E80C2ECA1256b88e595957E21488C7d681615",
      tokenAddress: "0x874069Fa1Eb16D44d622F2e0Ca25eeA172369bC1",
      wrappedAddress: "0xd5736EbC74D1Bc37F73c5F54D51a4ff76f4338E4",
      symbol: "cUSD",
      decimals: 18,
    },
    {
      poolAddress: "0xbFdA54304079F869457f0FBDf5916835A92549a6",
      tokenAddress: "0x10c892A6EC43a53E45D0B916B4b7D383B1b78C0F",
      wrappedAddress: "0xf981837D1D991217507330b18e4316e192bdce50",
      symbol: "cEUR",
      decimals: 18,
    },
  ],
};
