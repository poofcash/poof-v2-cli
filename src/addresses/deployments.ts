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
      poolAddress: "0x7e0f9Ac3B1d508Af90dB39D6bd02E62a44c6F96a",
      tokenAddress: "0x874069Fa1Eb16D44d622F2e0Ca25eeA172369bC1",
      symbol: "cUSD",
      decimals: 18,
    },
  ],
};
