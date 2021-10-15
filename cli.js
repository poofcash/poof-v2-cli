#!/usr/bin/env node

require("dotenv").config();
const Web3 = require("web3");
const { PoofKit } = require("./dist");
const { toWei, toBN, fromWei } = require("web3-utils");
const yargs = require("yargs");
const snarkjs = require("snarkjs");
const ERC20Artifact = require("./dist/artifacts/ERC20.json");

const { PRIVATE_KEY, RPC_URL, POOF_PRIVATE_KEY } = process.env;
const web3 = new Web3(RPC_URL);
const { address: senderAccount } = web3.eth.accounts.wallet.add(PRIVATE_KEY);

let poofKit, netId, explorer, gasPrice;

const init = async () => {
  netId = await web3.eth.getChainId();
  poofKit = new PoofKit(web3);
  poofKit.initialize(snarkjs);
  explorer = {
    44787: "https://alfajores-blockscout.celo-testnet.org",
    42220: "https://explorer.celo.org",
    4002: "https://explorer.testnet.fantom.network",
    250: "https://explorer.fantom.network",
  }[netId];
  gasPrice = {
    44787: toWei("0.5", "gwei"),
    42220: toWei("0.5", "gwei"),
    4002: toWei("100", "gwei"),
  }[netId];
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
    "approve <currency>",
    "Allow for 100 units of an ERC20 token",
    (yargs) => {
      yargs.positional("currency", {
        type: "string",
        describe: "The ERC20 symbol to approve",
      });
    },
    async (argv) => {
      await init();
      const { currency } = argv;
      const approveTxo = await poofKit.approve(currency, toWei("100"));
      const tx = await approveTxo.send({ from: senderAccount });
      console.log(`Transaction: ${getExplorerTx(tx.transactionHash)}`);
    }
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
    async (argv) => {
      await init();
      const { currency, amount } = argv;
      const poolMatch = await poofKit.poolMatch(currency);
      const depositTxo = await poofKit.deposit(
        POOF_PRIVATE_KEY,
        currency,
        toBN(toWei(amount)),
        toBN(0)
      );
      const gas = await depositTxo.estimateGas({
        value: poolMatch.token ? 0 : toWei(amount),
        gasPrice,
      });
      const tx = await depositTxo.send({
        from: senderAccount,
        value: poolMatch.token ? 0 : toWei(amount),
        gasPrice,
        gas,
      });
      console.log(`Transaction: ${getExplorerTx(tx.transactionHash)}`);
    }
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
    async (argv) => {
      await init();
      const { currency, amount } = argv;
      const burnTxo = await poofKit.deposit(
        POOF_PRIVATE_KEY,
        currency,
        toBN(0),
        toBN(toWei(amount))
      );
      const gas = await burnTxo.estimateGas({
        gasPrice,
      });
      const tx = await burnTxo.send({ from: senderAccount, gasPrice, gas });
      console.log(`Transaction: ${getExplorerTx(tx.transactionHash)}`);
    }
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
    async (argv) => {
      await init();
      const { currency, amount, recipient, relayerUrl } = argv;
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
        const gas = await txo.estimateGas({
          gasPrice,
        });
        const tx = await txo.send({ from: senderAccount, gasPrice, gas });
        console.log(`Transaction: ${getExplorerTx(tx.transactionHash)}`);
      }
    }
  )
  .command(
    "mint <currency> <amount> [recipient] [relayerUrl]",
    "Mint tokens collateralized on hidden balance",
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
    async (argv) => {
      await init();
      const { currency, amount, recipient, relayerUrl } = argv;
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
        const gas = await txo.estimateGas({
          gasPrice,
        });
        const tx = await txo.send({ from: senderAccount, gasPrice, gas });
        console.log(`Transaction: ${getExplorerTx(tx.transactionHash)}`);
      }
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
    async (argv) => {
      await init();
      const { currency } = argv;
      const account = await poofKit.getLatestAccount(
        POOF_PRIVATE_KEY,
        currency
      );
      const unitPerUnderlying = await poofKit.unitPerUnderlying(currency);
      console.log(
        `Private balance: ${
          account ? fromWei(account.amount.div(unitPerUnderlying)) : 0
        } ${currency}`
      );
      console.log(
        `Private debt: ${account ? fromWei(account.debt) : 0} ${currency}`
      );

      const poolMatch = await poofKit.poolMatch(currency);
      const balance = await poofKit.balance(currency, senderAccount);
      const pToken = new web3.eth.Contract(
        ERC20Artifact.abi,
        poolMatch.poolAddress
      );
      const debt = await pToken.methods.balanceOf(senderAccount).call();
      console.log(`Public balance: ${fromWei(balance)} ${currency}`);
      console.log(`Public debt: ${fromWei(debt)} ${currency}`);
    }
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
    "test [relayerUrl]",
    "Deposit, withdraw",
    (yargs) => {
      yargs.positional("relayerUrl", {
        type: "string",
        describe: "Optional relayer URL for withdrawal",
      });
    },
    async (argv) => {
      await init();
      const { relayerUrl } = argv;

      const currency = "cUSD";
      const amount = toBN("1000");

      // Approve
      const approveTxo = await poofKit.approve(currency, toWei("1000000"));
      const approveTx = await approveTxo.send({ from: senderAccount });
      console.log(`Approve: ${getExplorerTx(approveTx.transactionHash)}`);

      // Deposit
      const depositTxo = await poofKit.deposit(
        POOF_PRIVATE_KEY,
        currency,
        amount
      );
      const depositTx = await depositTxo.send({ from: senderAccount });
      console.log(`Deposit: ${getExplorerTx(depositTx.transactionHash)}`);

      // Withdraw
      const res = await poofKit.withdraw(
        POOF_PRIVATE_KEY,
        currency,
        amount,
        senderAccount,
        relayerUrl
      );
      if (relayerUrl) {
        const hash = res;
        console.log(`Withdraw: ${getExplorerTx(hash)}`);
      } else {
        const txo = res;
        const tx = await txo.send({ from: senderAccount });
        console.log(`Withdraw: ${getExplorerTx(tx.transactionHash)}`);
      }
    }
  )
  .help().argv;
