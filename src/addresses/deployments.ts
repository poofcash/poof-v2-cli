type CurrencyEntry = {
  poolAddress: string;
  tokenAddress?: string;
  symbol: string;
  pSymbol: string;
  decimals: 18;
};

export const deployments: Record<string | number, Array<CurrencyEntry>> = {
  42220: [
    {
      poolAddress: "0xE74AbF23E1Fdf7ACbec2F3a30a772eF77f1601E1",
      tokenAddress: "0x471EcE3750Da237f93B8E339c536989b8978a438",
      symbol: "CELO",
      pSymbol: "pCELO",
      decimals: 18,
    },
    {
      poolAddress: "0xB4aa2986622249B1F45eb93F28Cfca2b2606d809",
      tokenAddress: "0x765DE816845861e75A25fCA122bb6898B8B1282a",
      symbol: "cUSD",
      pSymbol: "pUSD",
      decimals: 18,
    },
    {
      poolAddress: "0x56072D4832642dB29225dA12d6Fd1290E4744682",
      tokenAddress: "0xd8763cba276a3738e6de85b4b3bf5fded6d6ca73",
      symbol: "cEUR",
      pSymbol: "pEUR",
      decimals: 18,
    },
  ],
  44787: [
    {
      poolAddress: "0xC70AeD458BcE450999425C53Ce11F99fC34a8203",
      tokenAddress: "0xF194afDf50B03e69Bd7D057c1Aa9e10c9954E4C9",
      symbol: "CELO",
      pSymbol: "pCELO",
      decimals: 18,
    },
    {
      poolAddress: "0x9d8D44f68642668980Af3f3e32Ad31682e41bEf4",
      tokenAddress: "0x874069Fa1Eb16D44d622F2e0Ca25eeA172369bC1",
      symbol: "cUSD",
      pSymbol: "pUSD",
      decimals: 18,
    },
    {
      poolAddress: "0xD5db1B389948dA50b190579De818e0d081a87D48",
      tokenAddress: "0x10c892A6EC43a53E45D0B916B4b7D383B1b78C0F",
      symbol: "cEUR",
      pSymbol: "pEUR",
      decimals: 18,
    },
  ],
  4002: [
    {
      poolAddress: "0x56072D4832642dB29225dA12d6Fd1290E4744682",
      symbol: "FTM",
      pSymbol: "pFTM",
      decimals: 18,
    },
  ],
  250: [
    {
      poolAddress: "0xAdfC2a82becC26C48ed0d1A06C813d283cB39006",
      symbol: "FTM",
      pSymbol: "pFTM",
      decimals: 18,
    },
  ],
};
