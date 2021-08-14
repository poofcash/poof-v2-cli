import { toBN, AbiItem, toWei, fromWei } from "web3-utils";
import { Contract, EventData } from "web3-eth-contract";
import ERC20Artifact from "./artifacts/ERC20.json";
import PoofArtifact from "./artifacts/Poof.json";
import { calculateFee, unpackEncryptedMessage } from "./utils";
import axios from "axios";
import { Address } from "@celo/base";
import { Controller } from "./controller";
import { Account } from "./account";
import { getEncryptionPublicKey } from "eth-sig-util";
import { deployments } from "./addresses/deployments";
import { decompressSync } from "fflate";
import { ERC20 } from "./generated/ERC20";
import BN from "bn.js";
import { Poof } from "./generated/Poof";
import Web3 from "web3";

const TRIES = 20;

export type PoofDeposit = {
  tornado: string;
  commitment: string;
  encryptedNote: string;
};

type ProvingKeys = {
  depositCircuit?: any;
  depositProvingKey?: any;
  withdrawCircuit?: any;
  withdrawProvingKey?: any;
  treeUpdateCircuit?: any;
  treeUpdateProvingKey?: any;
};

export class PoofKit {
  private poof: Contract;
  private controller: Controller;
  private provingKeys: ProvingKeys = {};
  private groth16: any;

  constructor(private web3: Web3) {}

  initialize(groth16: any) {
    this.groth16 = groth16;
  }

  async poofEvents(eventName: string, fromBlock: number): Promise<EventData[]> {
    return await this.poof.getPastEvents(eventName, {
      fromBlock,
      toBlock: "latest",
    });
  }

  async getProofDeps(circuitUrl: string, provingKeyUrl: string) {
    return await Promise.all([
      fetch(circuitUrl)
        .then((x) => x.arrayBuffer())
        .then((x) =>
          JSON.parse(
            new TextDecoder().decode(decompressSync(new Uint8Array(x)))
          )
        ),
      fetch(provingKeyUrl)
        .then((x) => x.arrayBuffer())
        .then((x) => decompressSync(new Uint8Array(x)).buffer),
    ]);
  }

  async initializeDeposit() {
    const [depositCircuit, depositProvingKey] = await this.getProofDeps(
      "https://cloudflare-ipfs.com/ipfs/QmfQLfWGRLBjr5dJD21X34CHjoVDNLXwHzzL1ohgDSFvKA",
      "https://cloudflare-ipfs.com/ipfs/QmYh6643t2xeMv7Hz3jKoZyfVxakQQTah9dYUWWo8A8gpw"
    );
    this.provingKeys.depositCircuit = depositCircuit;
    this.provingKeys.depositProvingKey = depositProvingKey;
    this.controller = new Controller({
      groth16: this.groth16,
      provingKeys: this.provingKeys,
    });
  }

  async initializeWithdraw() {
    const [withdrawCircuit, withdrawProvingKey] = await this.getProofDeps(
      "https://cloudflare-ipfs.com/ipfs/Qmbu1Z2j3hrJJ9HgRGXfGXGncWAu5DJ9qXVFRJbZqKwz91",
      "https://cloudflare-ipfs.com/ipfs/QmTmjhzhRAqHzcMJdkRU6Bviyhjt5NZHsSmEhby9MWkCtn"
    );
    this.provingKeys.withdrawCircuit = withdrawCircuit;
    this.provingKeys.withdrawProvingKey = withdrawProvingKey;
    this.controller = new Controller({
      groth16: this.groth16,
      provingKeys: this.provingKeys,
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
    accountEvents?: EventData[]
  ) {
    const poolMatch = await this.poolMatch(currency);
    if (poolMatch) {
      if (
        !this.provingKeys.depositCircuit ||
        !this.provingKeys.depositProvingKey
      ) {
        await this.initializeDeposit();
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
      });
      return poof.methods["deposit"](proof, args);
    }
    return null;
  }

  async withdraw(
    privateKey: string,
    currency: string,
    amount: BN,
    recipient: Address,
    relayerURL?: string,
    accountEvents?: EventData[]
  ) {
    const poolMatch = await this.poolMatch(currency);
    if (poolMatch) {
      const { poolAddress, decimals } = poolMatch;

      if (
        !this.provingKeys.withdrawCircuit ||
        !this.provingKeys.withdrawProvingKey
      ) {
        await this.initializeWithdraw();
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
        fee = calculateFee(
          gasPrice,
          fromWei(amount), // HARDCODE: 18 decimal assumption
          0,
          currencyCeloPrice,
          poofServiceFee,
          decimals,
          5e5
        );
        if (fee.gt(amount)) {
          throw new Error("Fee is higher than the redeem amount");
        }
        relayer = rewardAccount;
      }

      const { proof, args } = await this.controller.withdraw(poof, {
        account: latestAccount,
        amount: amount.sub(fee),
        recipient,
        publicKey,
        fee,
        relayer,
      });
      if (relayerURL) {
        console.info("Sending withdraw transaction through relay");
        try {
          const relay = await axios.post(relayerURL + "/v2/withdraw", {
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
        return poof.methods["withdraw"](proof, args);
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
      return latestAccount.amount.toString();
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
