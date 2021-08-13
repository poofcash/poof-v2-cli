type CurrencyEntry = {
  poolAddress: string;
  tokenAddress: string;
  symbol: string;
  decimals: 18;
};

export const deployments: Record<string | number, Array<CurrencyEntry>> = {
  42220: [],
  44787: [
    {
      poolAddress: "0x530593A254636BE43dEd686a75fc43E31012EcaF",
      tokenAddress: "0x874069Fa1Eb16D44d622F2e0Ca25eeA172369bC1",
      symbol: "cUSD",
      decimals: 18,
    },
  ],
};
