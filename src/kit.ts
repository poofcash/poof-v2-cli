import { toBN, AbiItem, fromWei } from "web3-utils";
import { Contract, EventData } from "web3-eth-contract";
import ERC20Artifact from "./artifacts/ERC20.json";
import IWERC20Artifact from "./artifacts/IWERC20.json";
import PoofArtifact from "./artifacts/Poof.json";
import { calculateFee, unpackEncryptedMessage } from "./utils";
import axios from "axios";
import { Address } from "@celo/base";
import { Controller, Operation } from "./controller";
import { Account } from "./account";
import { getEncryptionPublicKey } from "eth-sig-util";
import { deployments } from "./addresses/deployments";
import { decompressSync } from "fflate";
import { ERC20 } from "./generated/ERC20";
import BN from "bn.js";
import { Poof } from "./generated/Poof";

const TRIES = 20;

export type PoofDeposit = {
  tornado: string;
  commitment: string;
  encryptedNote: string;
};

type ProvingKeys = {
  depositWasm?: Uint8Array;
  depositZkey?: Uint8Array;
  withdrawWasm?: Uint8Array;
  withdrawZkey?: Uint8Array;
  treeUpdateWasm?: Uint8Array;
  treeUpdateZkey?: Uint8Array;
};

export class PoofKit {
  private poof: Contract;
  private controller: Controller;
  private provingKeys: ProvingKeys = {};
  private snarkjs: any;

  constructor(private web3: any) {}

  initialize(snarkjs: any) {
    this.snarkjs = snarkjs;
  }

  async poofEvents(eventName: string, fromBlock: number): Promise<EventData[]> {
    return await this.poof.getPastEvents(eventName, {
      fromBlock,
      toBlock: "latest",
    });
  }

  async getProofDeps(deps: string[]) {
    return await Promise.all(
      deps.map((dep) =>
        fetch(dep)
          .then((x) => x.arrayBuffer())
          .then((x) => decompressSync(new Uint8Array(x)))
      )
    );
  }

  async initializeDeposit() {
    const [depositWasm, depositZkey] = await this.getProofDeps([
      "https://poof.nyc3.digitaloceanspaces.com/Deposit.wasm.gz",
      "https://poof.nyc3.digitaloceanspaces.com/Deposit_circuit_final.zkey.gz",
    ]);
    this.provingKeys.depositWasm = depositWasm;
    this.provingKeys.depositZkey = depositZkey;
    this.controller = new Controller({
      provingKeys: this.provingKeys,
      snarkjs: this.snarkjs,
    });
  }

  async initializeWithdraw() {
    const [withdrawWasm, withdrawZkey] = await this.getProofDeps([
      "https://poof.nyc3.digitaloceanspaces.com/Withdraw.wasm.gz",
      "https://poof.nyc3.digitaloceanspaces.com/Withdraw_circuit_final.zkey.gz",
    ]);
    this.provingKeys.withdrawWasm = withdrawWasm;
    this.provingKeys.withdrawZkey = withdrawZkey;
    this.controller = new Controller({
      provingKeys: this.provingKeys,
      snarkjs: this.snarkjs,
    });
  }

  async poolMatch(currency: string) {
    const chainId = await this.web3.eth.getChainId();
    return deployments[chainId].find(
      (e) => e.symbol.toLowerCase() === currency.toLowerCase()
    );
  }

  async allowance(currency: string, owner: string) {
    const poolMatch = await this.poolMatch(currency);
    if (poolMatch) {
      const { tokenAddress, poolAddress } = poolMatch;
      const token = new this.web3.eth.Contract(
        ERC20Artifact.abi as AbiItem[],
        tokenAddress
      );
      return await token.methods.allowance(owner, poolAddress).call();
    }
    return null;
  }

  async balance(currency: string, owner: string) {
    const poolMatch = await this.poolMatch(currency);
    if (poolMatch) {
      const { tokenAddress } = poolMatch;
      const token = new this.web3.eth.Contract(
        ERC20Artifact.abi as AbiItem[],
        tokenAddress
      );
      return await token.methods.balanceOf(owner).call();
    }
    return null;
  }

  async poolBalance(currency: string) {
    const poolMatch = await this.poolMatch(currency);
    if (poolMatch) {
      const { tokenAddress, poolAddress } = poolMatch;
      const token = new this.web3.eth.Contract(
        ERC20Artifact.abi as AbiItem[],
        tokenAddress
      );
      return await token.methods.balanceOf(poolAddress).call();
    }
    return null;
  }

  async approve(currency: string, amount: BN) {
    const poolMatch = await this.poolMatch(currency);
    if (poolMatch) {
      const { tokenAddress, poolAddress } = poolMatch;
      const token = new this.web3.eth.Contract(
        ERC20Artifact.abi as AbiItem[],
        tokenAddress
      ) as unknown as ERC20;
      return token.methods.approve(poolAddress, amount);
    }
    return null;
  }

  async deposit(
    privateKey: string,
    currency: string,
    amount: BN,
    operation: Operation.DEPOSIT | Operation.BURN,
    accountEvents?: EventData[]
  ) {
    const poolMatch = await this.poolMatch(currency);
    if (poolMatch) {
      if (!this.provingKeys.depositWasm || !this.provingKeys.depositZkey) {
        await this.initializeDeposit();
      }
      if (poolMatch.wrappedAddress) {
        const wrapped = new this.web3.eth.Contract(
          IWERC20Artifact.abi as AbiItem[],
          poolMatch.wrappedAddress
        );
        amount = toBN(await wrapped.methods.underlyingToDebt(amount).call());
      }
      const poof = new this.web3.eth.Contract(
        PoofArtifact.abi as AbiItem[],
        poolMatch.poolAddress
      ) as unknown as Poof;
      const publicKey = getEncryptionPublicKey(privateKey);
      const account = await this.getLatestAccount(
        privateKey,
        poof,
        accountEvents
      );
      const { proof, args } = await this.controller.deposit(poof, {
        account: account || new Account(),
        publicKey,
        amount,
        operation,
      });
      return poof.methods[operation === Operation.DEPOSIT ? "deposit" : "burn"](
        proof,
        args
      );
    }
    return null;
  }

  async withdraw(
    privateKey: string,
    currency: string,
    amount: BN,
    recipient: Address,
    operation: Operation.WITHDRAW | Operation.MINT,
    relayerURL?: string,
    accountEvents?: EventData[]
  ) {
    const poolMatch = await this.poolMatch(currency);
    if (poolMatch) {
      const { poolAddress, decimals } = poolMatch;

      if (!this.provingKeys.withdrawWasm || !this.provingKeys.withdrawZkey) {
        await this.initializeWithdraw();
      }
      if (poolMatch.wrappedAddress) {
        const wrapped = new this.web3.eth.Contract(
          IWERC20Artifact.abi as AbiItem[],
          poolMatch.wrappedAddress
        );
        amount = toBN(await wrapped.methods.underlyingToDebt(amount).call());
      }
      const poof = new this.web3.eth.Contract(
        PoofArtifact.abi as AbiItem[],
        poolAddress
      ) as unknown as Poof;
      const latestAccount = await this.getLatestAccount(
        privateKey,
        poof,
        accountEvents
      );
      if (!latestAccount) {
        throw new Error("Poof account has no AP");
      }
      const publicKey = getEncryptionPublicKey(privateKey);
      let fee = toBN(0);
      let relayer: Address;
      if (relayerURL) {
        const relayerStatus = await axios.get(relayerURL + "/status");
        const { gasPrices, celoPrices, rewardAccount, poofServiceFee } =
          relayerStatus.data;
        const gasPrice = gasPrices["min"] || 0.5;
        const currencyCeloPrice = celoPrices[currency.toLowerCase()];
        // Add 1% buffer for the fee
        fee = calculateFee(
          gasPrice,
          fromWei(amount), // HARDCODE: 18 decimal assumption
          0,
          currencyCeloPrice,
          poofServiceFee,
          decimals,
          1e6
        )
          .mul(toBN(101))
          .div(toBN(100));
        if (fee.gt(amount)) {
          throw new Error("Fee is higher than the redeem amount");
        }
        relayer = rewardAccount;
      }

      const { proof, args } = await this.controller.withdraw(poof, {
        account: latestAccount,
        amount: amount,
        recipient,
        publicKey,
        fee,
        relayer,
        operation,
      });
      if (relayerURL) {
        console.info("Sending withdraw transaction through relay");
        try {
          const endpoint =
            operation === Operation.WITHDRAW ? "/v2/withdraw" : "/v2/mint";
          const relay = await axios.post(relayerURL + endpoint, {
            contract: poolAddress,
            proof,
            args,
          });
          let tries = TRIES;
          while (tries > 0) {
            console.info(`Trying to fetch transaction hash, try #${tries}`);
            const job = await axios.get(
              relayerURL + `/v1/jobs/${relay.data.id}`
            );
            if (job.data.txHash) {
              console.info(
                `Transaction submitted through the relay. The transaction hash is ${job.data.txHash}`
              );
              return job.data.txHash;
            } else {
              tries -= 1;
              await new Promise((resolve) => setTimeout(resolve, 1000));
            }
          }
        } catch (e) {
          if (e.response) {
            console.error(e.response.data.error);
          } else {
            console.error(e.message);
          }
        }
      } else {
        return poof.methods[
          operation === Operation.WITHDRAW ? "withdraw" : "mint"
        ](proof, args);
      }
    }
    return null;
  }

  async hiddenBalance(privateKey: string, currency: string) {
    const poolMatch = await this.poolMatch(currency);
    if (poolMatch) {
      const poof = new this.web3.eth.Contract(
        PoofArtifact.abi as AbiItem[],
        poolMatch.poolAddress
      ) as unknown as Poof;
      const latestAccount = await this.getLatestAccount(privateKey, poof);
      if (!latestAccount) {
        return "0";
      }
      if (poolMatch.wrappedAddress) {
        const wrapped = new this.web3.eth.Contract(
          IWERC20Artifact.abi as AbiItem[],
          poolMatch.wrappedAddress
        );
        return await wrapped.methods
          .debtToUnderlying(latestAccount.amount)
          .call();
      }
      return latestAccount.amount;
    }
    return null;
  }

  async getLatestAccount(
    privateKey: string,
    poof: Poof,
    accountEvents?: EventData[]
  ) {
    accountEvents =
      accountEvents ||
      (await poof.getPastEvents("NewAccount", {
        fromBlock: 0,
        toBlock: "latest",
      }));
    // Sort events descending by time and stop at the first account that decrypts
    const event = accountEvents
      .sort((a, b) => b.blockNumber - a.blockNumber)
      .find((e) => {
        try {
          Account.decrypt(
            privateKey,
            unpackEncryptedMessage(e.returnValues.encryptedAccount)
          );
          return true;
        } catch (e) {}
        return false;
      });
    if (!event) {
      return undefined;
    }
    return Account.decrypt(
      privateKey,
      unpackEncryptedMessage(event.returnValues.encryptedAccount)
    );
  }

  async verify(currency: string) {
    const poolMatch = await this.poolMatch(currency);
    if (poolMatch) {
      const poof = new this.web3.eth.Contract(
        PoofArtifact.abi as AbiItem[],
        poolMatch.poolAddress
      ) as unknown as Poof;
      const token = await poof.methods.token().call();
      const owner = await poof.methods.owner().call();
      return { token, owner };
    }
    return null;
  }
}
