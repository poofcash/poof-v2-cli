#!/usr/bin/env node

require("dotenv").config();
const Web3 = require("web3");
const { PoofKit } = require("./dist");
const { getProofDeps } = require("./dist");
const { toWei, toBN, fromWei } = require("web3-utils");
const yargs = require("yargs");
const snarkjs = require("snarkjs");
const ERC20Artifact = require("./dist/artifacts/ERC20.json");

const { PRIVATE_KEY, RPC_URL, POOF_PRIVATE_KEY } = process.env;
const web3 = new Web3(RPC_URL);
const { address: senderAccount } = web3.eth.accounts.wallet.add(PRIVATE_KEY);
const poofKit = new PoofKit(web3);

let netId, explorer, gasPrice, depsInitialized;
const gas = 1.7e6;

const init = async (skipDeps, provingSystem) => {
  netId = await web3.eth.getChainId();
  poofKit.initialize(() => snarkjs);
  explorer = {
    44787: "https://alfajores-blockscout.celo-testnet.org",
    42220: "https://explorer.celo.org",
    4002: "https://explorer.testnet.fantom.network",
    250: "https://explorer.fantom.network",
    80001: "https://mumbai.polygonscan.com",
    137: "https://polygonscan.com",
    43113: "https://testnet.snowtrace.io",
    43114: "https://snowtrace.io",
    42: "https://kovan.etherscan.io",
    1: "https://etherscan.io",
  }[netId];
  gasPrice = {
    44787: toWei("0.5", "gwei"),
    42220: toWei("0.5", "gwei"),
    4002: toWei("100", "gwei"),
    250: toWei("200", "gwei"),
    80001: toWei("10", "gwei"),
    137: toWei("60", "gwei"),
    43113: toWei("30", "gwei"),
    43114: toWei("30", "gwei"),
    42: toWei("2", "gwei"),
    1: toWei("90", "gwei"),
  }[netId];

  if (!skipDeps && !depsInitialized) {
    // Initialize deps
    await getProofDeps([
      provingSystem === 1
        ? "https://poof.nyc3.cdn.digitaloceanspaces.com/Deposit2.wasm.gz"
        : "https://poofgroth.nyc3.cdn.digitaloceanspaces.com/Deposit.wasm.gz",
      provingSystem === 1
        ? "https://poof.nyc3.cdn.digitaloceanspaces.com/Deposit2_circuit_final.zkey.gz"
        : "https://poofgroth.nyc3.cdn.digitaloceanspaces.com/Deposit_circuit_final.zkey.gz",
    ]).then((deps) =>
      poofKit.initializeDeposit(
        async () => deps[0],
        async () => deps[1]
      )
    );
    await getProofDeps([
      provingSystem === 1
        ? "https://poof.nyc3.cdn.digitaloceanspaces.com/Withdraw2.wasm.gz"
        : "https://poofgroth.nyc3.cdn.digitaloceanspaces.com/Withdraw.wasm.gz",
      provingSystem === 1
        ? "https://poof.nyc3.cdn.digitaloceanspaces.com/Withdraw2_circuit_final.zkey.gz"
        : "https://poofgroth.nyc3.cdn.digitaloceanspaces.com/Withdraw_circuit_final.zkey.gz",
    ]).then((deps) =>
      poofKit.initializeWithdraw(
        async () => deps[0],
        async () => deps[1]
      )
    );
    await getProofDeps([
      provingSystem === 1
        ? "https://poof.nyc3.cdn.digitaloceanspaces.com/InputRoot.wasm.gz"
        : "https://poofgroth.nyc3.cdn.digitaloceanspaces.com/InputRoot.wasm.gz",
      provingSystem === 1
        ? "https://poof.nyc3.cdn.digitaloceanspaces.com/InputRoot_circuit_final.zkey.gz"
        : "https://poofgroth.nyc3.cdn.digitaloceanspaces.com/InputRoot_circuit_final.zkey.gz",
    ]).then((deps) =>
      poofKit.initializeInputRoot(
        async () => deps[0],
        async () => deps[1]
      )
    );
    await getProofDeps([
      provingSystem === 1
        ? "https://poof.nyc3.cdn.digitaloceanspaces.com/OutputRoot.wasm.gz"
        : "https://poofgroth.nyc3.cdn.digitaloceanspaces.com/OutputRoot.wasm.gz",
      provingSystem === 1
        ? "https://poof.nyc3.cdn.digitaloceanspaces.com/OutputRoot_circuit_final.zkey.gz"
        : "https://poofgroth.nyc3.cdn.digitaloceanspaces.com/OutputRoot_circuit_final.zkey.gz",
    ]).then((deps) =>
      poofKit.initializeOutputRoot(
        async () => deps[0],
        async () => deps[1]
      )
    );
    depsInitialized = true;
  }
};

const approve = async (argv) => {
  await init();
  const { currency, amount } = argv;
  const poolMatch = await poofKit.poolMatch(currency);
  const approveTxo = await poofKit.approve(currency, toWei(amount));
  const params = {
    from: senderAccount,
    to: poolMatch.tokenAddress,
    data: approveTxo.encodeABI(),
    gasPrice,
  };
  const gas = await web3.eth.estimateGas(params);
  const tx = await web3.eth.sendTransaction({
    ...params,
    gas,
  });
  console.log(`Transaction: ${getExplorerTx(tx.transactionHash)}`);
};

const deposit = async (argv) => {
  const { currency, amount } = argv;
  const poolMatch = await poofKit.poolMatch(currency);
  await init(false, poolMatch.provingSystem);
  const depositTxo = await poofKit.deposit(
    POOF_PRIVATE_KEY,
    currency,
    toBN(toWei(amount)),
    toBN(0)
  );
  const params = {
    from: senderAccount,
    to: poolMatch.poolAddress,
    data: depositTxo.encodeABI(),
    value: poolMatch.tokenAddress
      ? 0
      : toBN(toWei(amount)).mul(toBN(100001)).div(toBN(100000)),
    gasPrice,
  };
  // const gas = await web3.eth.estimateGas(params);
  const tx = await web3.eth.sendTransaction({
    ...params,
    gas,
  });
  console.log(`Transaction: ${getExplorerTx(tx.transactionHash)}`);
};

const burn = async (argv) => {
  const { currency, amount } = argv;
  const poolMatch = await poofKit.poolMatch(currency);
  await init(false, poolMatch.provingSystem);
  const burnTxo = await poofKit.deposit(
    POOF_PRIVATE_KEY,
    currency,
    toBN(0),
    toBN(toWei(amount))
  );
  const params = {
    from: senderAccount,
    to: poolMatch.poolAddress,
    data: burnTxo.encodeABI(),
    gasPrice,
  };
  // const gas = await web3.eth.estimateGas(params);
  const tx = await web3.eth.sendTransaction({
    ...params,
    gas,
  });
  console.log(`Transaction: ${getExplorerTx(tx.transactionHash)}`);
};

const withdraw = async (argv) => {
  const { currency, amount, recipient, relayerUrl } = argv;
  const poolMatch = await poofKit.poolMatch(currency);
  await init(false, poolMatch.provingSystem);
  const res = await poofKit.withdraw(
    POOF_PRIVATE_KEY,
    currency,
    toBN(toWei(amount)),
    toBN(0),
    recipient || senderAccount,
    relayerUrl
  );
  if (relayerUrl) {
    const hash = res;
    console.log(`Transaction: ${getExplorerTx(hash)}`);
  } else {
    const txo = res;
    const params = {
      from: senderAccount,
      to: poolMatch.poolAddress,
      data: txo.encodeABI(),
      gasPrice,
    };
    // const gas = await web3.eth.estimateGas(params);
    const tx = await web3.eth.sendTransaction({ ...params, gas });
    console.log(`Transaction: ${getExplorerTx(tx.transactionHash)}`);
  }
};

const mint = async (argv) => {
  const { currency, amount, recipient, relayerUrl } = argv;
  const poolMatch = await poofKit.poolMatch(currency);
  await init(false, poolMatch.provingSystem);
  const res = await poofKit.withdraw(
    POOF_PRIVATE_KEY,
    currency,
    toBN(0),
    toBN(toWei(amount)),
    recipient || senderAccount,
    relayerUrl
  );
  if (relayerUrl) {
    const hash = res;
    console.log(`Transaction: ${getExplorerTx(hash)}`);
  } else {
    const txo = res;
    const params = {
      from: senderAccount,
      to: poolMatch.poolAddress,
      data: txo.encodeABI(),
      gasPrice,
    };
    // const gas = await web3.eth.estimateGas(params);
    const tx = await web3.eth.sendTransaction({ ...params, gas });
    console.log(`Transaction: ${getExplorerTx(tx.transactionHash)}`);
  }
};

const balances = async (argv) => {
  await init(true);
  const { currency } = argv;
  const account = await poofKit.getLatestAccount(POOF_PRIVATE_KEY, currency);
  const { symbol, pSymbol, pTokenAddress } = await poofKit.poolMatch(currency);
  const unitPerUnderlying = await poofKit.unitPerUnderlying(currency);
  console.log(`Account index: ${account && account.accountIdx}`);
  console.log(
    `Previous account index: ${account && account.previousAccountIdx}`
  );
  console.log(
    `Private balance: ${
      account ? fromWei(account.amount.div(unitPerUnderlying)) : 0
    } ${symbol}`
  );
  console.log(
    `Private debt: ${account ? fromWei(account.debt) : 0} ${pSymbol}`
  );

  const balance = await poofKit.balance(currency, senderAccount);
  const pToken = new web3.eth.Contract(ERC20Artifact.abi, pTokenAddress);
  const debt = await pToken.methods.balanceOf(senderAccount).call();
  console.log(`Public balance: ${fromWei(balance)} ${symbol}`);
  console.log(`Public debt: ${fromWei(debt)} ${pSymbol}`);
};

const getExplorerTx = (hash) => {
  return `${explorer}/tx/${hash}`;
};

yargs
  .scriptName("poof-v2-cli")
  .usage("$0 <cmd> [args]")
  .command(
    "allowance <currency>",
    "Get the allowance for an ERC20 by the proxy contract",
    (yargs) => {
      yargs.positional("currency", {
        type: "string",
        describe: "The ERC20 symbol to check",
      });
    },
    async (argv) => {
      await init();
      const { currency } = argv;
      console.log(await poofKit.allowance(currency, senderAccount));
    }
  )
  .command(
    "approve <currency> <amount>",
    "Allow Poof pool to spend",
    (yargs) => {
      yargs.positional("currency", {
        type: "string",
        describe: "The ERC20 symbol to approve",
      });
      yargs.positional("amount", {
        type: "string",
        describe: "The amount to approve",
      });
    },
    approve
  )
  .command(
    "deposit <currency> <amount>",
    "Deposit into Poof",
    (yargs) => {
      yargs.positional("currency", {
        type: "string",
        describe: "The ERC20 symbol to deposit",
      });
      yargs.positional("amount", {
        type: "string",
        describe: "The amount to deposit",
      });
    },
    deposit
  )
  .command(
    "burn <currency> <amount>",
    "Deposit into Poof",
    (yargs) => {
      yargs.positional("currency", {
        type: "string",
        describe: "The ERC20 symbol to deposit",
      });
      yargs.positional("amount", {
        type: "string",
        describe: "The amount to deposit",
      });
    },
    burn
  )
  .command(
    "withdraw <currency> <amount> [recipient] [relayerUrl]",
    "Withdraw from Poof",
    (yargs) => {
      yargs.positional("currency", {
        type: "string",
        describe: "The ERC20 symbol to withdraw",
      });
      yargs.positional("amount", {
        type: "string",
        describe: "The amount to withdraw",
      });
      yargs.positional("recipient", {
        type: "string",
        describe: "The recipient address to send the withdrawal",
      });
      yargs.positional("relayerUrl", {
        type: "string",
        describe: "Optional relayer URL for withdrawal",
      });
    },
    withdraw
  )
  .command(
    "mint <currency> <amount> [recipient] [relayerUrl]",
    "Mint tokens collateralized on hidden balance",
    (yargs) => {
      yargs.positional("currency", {
        type: "string",
        describe: "The ERC20 symbol to mint",
      });
      yargs.positional("amount", {
        type: "string",
        describe: "The amount to mint",
      });
      yargs.positional("recipient", {
        type: "string",
        describe: "The recipient address to send the mint",
      });
      yargs.positional("relayerUrl", {
        type: "string",
        describe: "Optional relayer URL for mint",
      });
    },
    mint
  )
  .command(
    "fee <currency> <amount> <relayerUrl>",
    "Get fee",
    (yargs) => {
      yargs.positional("currency", {
        type: "string",
        describe: "The ERC20 symbol to mint",
      });
      yargs.positional("amount", {
        type: "string",
        describe: "The amount to mint",
      });
      yargs.positional("relayerUrl", {
        type: "string",
        describe: "Relayer url",
      });
    },
    async (argv) => {
      const { currency, amount, relayerUrl } = argv;
      await init();
      const fee = fromWei(
        await poofKit.getRelayerFee(relayerUrl, toBN(toWei(amount)), currency)
      );
      console.log(`Fee in ~wei: ${fee}`);
    }
  )
  .command(
    "account",
    "Get a new private key",
    () => {},
    () => {
      const privateKey = web3.eth.accounts.create().privateKey.slice(2);
      console.log(privateKey);
    }
  )
  .command(
    "balances [currency]",
    "Get latest account balances",
    () => {
      yargs.positional("currency", {
        type: "string",
        describe: "The ERC20 symbol to check hidden balance of",
      });
    },
    balances
  )
  .command(
    "verify [currency]",
    "Get pool details",
    () => {
      yargs.positional("currency", {
        type: "string",
        describe: "The ERC20 symbol to verify",
      });
    },
    async (argv) => {
      await init();
      const { currency } = argv;
      const res = await poofKit.verify(currency);
      console.log(res);
    }
  )
  .command(
    "test <currency> [relayerUrl]",
    "Deposit, withdraw",
    (yargs) => {
      yargs.positional("currency", {
        type: "string",
        describe: "Currency to test",
      });
      yargs.positional("relayerUrl", {
        type: "string",
        describe: "Optional relayer URL for withdrawal",
      });
    },
    async (argv) => {
      await init();
      const { currency } = argv;
      const poolMatch = await poofKit.poolMatch(currency);

      // Approve
      if (poolMatch.tokenAddress) {
        console.log("Approving...");
        await approve(argv);
      }

      const amount1 = "0.01";
      const amount2 = "0.001";

      console.log("Depositing...");
      await deposit({ ...argv, amount: amount1 });
      await new Promise((r) => setTimeout(r, 5000));
      await balances(argv);

      console.log("Minting...");
      await mint({ ...argv, amount: amount2 });
      await new Promise((r) => setTimeout(r, 5000));
      await balances(argv);

      console.log("Burning...");
      await burn({ ...argv, amount: amount2 });
      await new Promise((r) => setTimeout(r, 5000));
      await balances(argv);

      console.log("Withdrawing...");
      await withdraw({ ...argv, amount: amount1 });
      await new Promise((r) => setTimeout(r, 5000));
      await balances(argv);
    }
  )
  .help().argv;
