import { toBN, AbiItem } from "web3-utils";
import { Contract, EventData } from "web3-eth-contract";
import ERC20Artifact from "./artifacts/ERC20.json";
import PoofArtifact from "./artifacts/Poof.json";
import { calculateFee, getProofDeps, unpackEncryptedMessage } from "./utils";
import axios from "axios";
import { Controller } from "./controller";
import { Account } from "./account";
import { getEncryptionPublicKey } from "eth-sig-util";
import { deployments } from "./addresses/deployments";
import { ERC20 } from "./generated/ERC20";
import BN from "bn.js";
import { Poof } from "./generated/Poof";

const TRIES = 15;
const TRY_DELAY = 5000;
const MAX_INT =
  "115792089237316195423570985008687907853269984665640564039457584007913129639935";

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

  initializeDeposit(depositWasm: Uint8Array, depositZkey: Uint8Array) {
    this.provingKeys.depositWasm = depositWasm;
    this.provingKeys.depositZkey = depositZkey;
    this.controller = new Controller({
      provingKeys: this.provingKeys,
      snarkjs: this.snarkjs,
    });
  }

  initializeWithdraw(withdrawWasm: Uint8Array, withdrawZkey: Uint8Array) {
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
      (e) =>
        e.symbol.toLowerCase() === currency.toLowerCase() ||
        e.pSymbol.toLowerCase() === currency.toLowerCase()
    );
  }

  async allowance(currency: string, owner: string) {
    const poolMatch = await this.poolMatch(currency);
    if (poolMatch) {
      const { tokenAddress, poolAddress } = poolMatch;
      if (tokenAddress) {
        const token = new this.web3.eth.Contract(
          ERC20Artifact.abi as AbiItem[],
          tokenAddress
        );
        return await token.methods.allowance(owner, poolAddress).call();
      }
      return MAX_INT;
    }
    return null;
  }

  async balance(currency: string, owner: string) {
    const poolMatch = await this.poolMatch(currency);
    if (poolMatch) {
      const { tokenAddress } = poolMatch;
      if (tokenAddress) {
        const token = new this.web3.eth.Contract(
          ERC20Artifact.abi as AbiItem[],
          tokenAddress
        );
        return await token.methods.balanceOf(owner).call();
      }
      return await this.web3.eth.getBalance(owner);
    }
    return null;
  }

  async pBalance(currency: string, owner: string) {
    const poolMatch = await this.poolMatch(currency);
    if (poolMatch) {
      const { poolAddress } = poolMatch;
      const token = new this.web3.eth.Contract(
        ERC20Artifact.abi as AbiItem[],
        poolAddress
      );
      return await token.methods.balanceOf(owner).call();
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
    debt: BN,
    accountEvents?: EventData[]
  ) {
    const poolMatch = await this.poolMatch(currency);
    if (poolMatch) {
      if (!this.provingKeys.depositWasm || !this.provingKeys.depositZkey) {
        const [depositWasm, depositZkey] = await getProofDeps([
          "https://poof.nyc3.digitaloceanspaces.com/Deposit.wasm.gz",
          "https://cloudflare-ipfs.com/ipfs/bafybeicuhvy6kdplqnlhrlgfzpuhovdfepcia632qsoizxx3ylpkbwny2a/Deposit_circuit_final.zkey.gz",
        ]);
        this.initializeDeposit(depositWasm, depositZkey);
      }
      const poof = new this.web3.eth.Contract(
        PoofArtifact.abi as AbiItem[],
        poolMatch.poolAddress
      ) as unknown as Poof;
      const unitPerUnderlying = toBN(
        await poof.methods.unitPerUnderlying().call()
      );
      const amountInUnits = amount.mul(unitPerUnderlying);
      const publicKey = getEncryptionPublicKey(privateKey);
      const account = await this.getLatestAccount(
        privateKey,
        currency,
        accountEvents
      );
      const { proof, args } = await this.controller.deposit(poof, {
        account: account || new Account(),
        publicKey,
        amount: amountInUnits,
        debt,
        unitPerUnderlying,
      });
      return poof.methods[debt.eq(toBN(0)) ? "deposit" : "burn"](proof, args);
    }
    return null;
  }

  async withdraw(
    privateKey: string,
    currency: string,
    amount: BN,
    debt: BN,
    recipient: string,
    relayerURL?: string,
    accountEvents?: EventData[]
  ) {
    const poolMatch = await this.poolMatch(currency);
    if (poolMatch) {
      const { poolAddress } = poolMatch;

      if (!this.provingKeys.withdrawWasm || !this.provingKeys.withdrawZkey) {
        const [withdrawWasm, withdrawZkey] = await getProofDeps([
          "https://poof.nyc3.digitaloceanspaces.com/Withdraw.wasm.gz",
          "https://cloudflare-ipfs.com/ipfs/bafybeiaefemhlonovjy76srwryt6gaxt544xcye4gsmqlmikthhmandgsy/Withdraw_circuit_final.zkey.gz",
        ]);
        this.initializeWithdraw(withdrawWasm, withdrawZkey);
      }
      const poof = new this.web3.eth.Contract(
        PoofArtifact.abi as AbiItem[],
        poolAddress
      ) as unknown as Poof;
      const unitPerUnderlying = toBN(
        await poof.methods.unitPerUnderlying().call()
      );
      const amountInUnits = amount.mul(unitPerUnderlying);
      const latestAccount = await this.getLatestAccount(
        privateKey,
        currency,
        accountEvents
      );
      if (!latestAccount) {
        throw new Error("No previous account found");
      }
      const publicKey = getEncryptionPublicKey(privateKey);
      let fee = toBN(0);
      let relayer: string;
      if (relayerURL) {
        const relayerStatus = await axios.get(relayerURL + "/status");
        const { celoPrices, rewardAccount, poofServiceFee, gasPrices } =
          relayerStatus.data;
        const currencyCeloPrice = celoPrices[poolMatch.symbol.toLowerCase()];
        const gasPrice = Number(gasPrices["min"]);
        // Fee can come from amount or debt
        const feeFrom = amountInUnits.eq(toBN(0))
          ? debt.mul(unitPerUnderlying)
          : amountInUnits;
        // Fee with 0.1% buffer
        fee = calculateFee(
          feeFrom,
          Number(currencyCeloPrice),
          poofServiceFee,
          gasPrice,
          2e6
        )
          .mul(toBN(1001))
          .div(toBN(1000));
        if (fee.gt(feeFrom)) {
          throw new Error("Fee is higher than the `feeFrom`");
        }
        relayer = rewardAccount;
      }

      const { proof, args } = await this.controller.withdraw(poof, {
        account: latestAccount,
        amount: amountInUnits,
        debt,
        unitPerUnderlying,
        recipient,
        publicKey,
        fee,
        relayer,
      });
      const isWithdraw = debt.eq(toBN(0));
      if (relayerURL) {
        console.info("Sending withdraw transaction through relay");
        try {
          const endpoint = isWithdraw ? "/v2/withdraw" : "/v2/mint";
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
              await new Promise((resolve) => setTimeout(resolve, TRY_DELAY));
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
        return poof.methods[isWithdraw ? "withdraw" : "mint"](proof, args);
      }
    }
    return null;
  }

  async unitPerUnderlying(currency: string) {
    const poolMatch = await this.poolMatch(currency);
    if (poolMatch) {
      const poof = new this.web3.eth.Contract(
        PoofArtifact.abi as AbiItem[],
        poolMatch.poolAddress
      ) as unknown as Poof;
      return toBN(await poof.methods.unitPerUnderlying().call());
    }
    return null;
  }

  async getLatestAccount(
    privateKey: string,
    currency: string,
    accountEvents?: EventData[]
  ) {
    const poolMatch = await this.poolMatch(currency);
    if (poolMatch) {
      const poof = new this.web3.eth.Contract(
        PoofArtifact.abi as AbiItem[],
        poolMatch.poolAddress
      ) as unknown as Poof;
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
    return null;
  }

  async verify(currency: string) {
    const poolMatch = await this.poolMatch(currency);
    if (poolMatch) {
      const poof = new this.web3.eth.Contract(
        PoofArtifact.abi as AbiItem[],
        poolMatch.poolAddress
      ) as unknown as Poof;
      let debtToken;
      if (poolMatch.wrappedAddress) {
        debtToken = await poof.methods.debtToken().call();
      }
      const token = await poof.methods.token().call();
      return { token, debtToken };
    }
    return null;
  }
}
