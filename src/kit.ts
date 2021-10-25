import { toBN, AbiItem } from "web3-utils";
import { EventData } from "web3-eth-contract";
import ERC20Artifact from "./artifacts/ERC20.json";
import PoofArtifact from "./artifacts/Poof.json";
import {
  calculateFee,
  getPastEvents,
  toFixedHex,
  unpackEncryptedMessage,
} from "./utils";
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

export type ProvingKeys = {
  getDepositWasm?: () => Promise<Uint8Array>;
  getDepositZkey?: () => Promise<Uint8Array>;
  getWithdrawWasm?: () => Promise<Uint8Array>;
  getWithdrawZkey?: () => Promise<Uint8Array>;
  getInputRootWasm?: () => Promise<Uint8Array>;
  getInputRootZkey?: () => Promise<Uint8Array>;
  getOutputRootWasm?: () => Promise<Uint8Array>;
  getOutputRootZkey?: () => Promise<Uint8Array>;
  getTreeUpdateWasm?: () => Promise<Uint8Array>;
  getTreeUpdateZkey?: () => Promise<Uint8Array>;
};

export class PoofKit {
  private controller: Controller;
  private provingKeys: ProvingKeys = {};
  private getSnarkJs: () => any;

  constructor(private web3: any) {}

  initialize(getSnarkJs: () => any) {
    this.getSnarkJs = getSnarkJs;
  }

  initializeDeposit(
    getDepositWasm: () => Promise<Uint8Array>,
    getDepositZkey: () => Promise<Uint8Array>
  ) {
    this.provingKeys.getDepositWasm = getDepositWasm;
    this.provingKeys.getDepositZkey = getDepositZkey;
    this.controller = new Controller({
      provingKeys: this.provingKeys,
      getSnarkJs: this.getSnarkJs,
    });
  }

  initializeInputRoot(
    getInputRootWasm: () => Promise<Uint8Array>,
    getInputRootZkey: () => Promise<Uint8Array>
  ) {
    this.provingKeys.getInputRootWasm = getInputRootWasm;
    this.provingKeys.getInputRootZkey = getInputRootZkey;
    this.controller = new Controller({
      provingKeys: this.provingKeys,
      getSnarkJs: this.getSnarkJs,
    });
  }

  initializeOutputRoot(
    getOutputRootWasm: () => Promise<Uint8Array>,
    getOutputRootZkey: () => Promise<Uint8Array>
  ) {
    this.provingKeys.getOutputRootWasm = getOutputRootWasm;
    this.provingKeys.getOutputRootZkey = getOutputRootZkey;
    this.controller = new Controller({
      provingKeys: this.provingKeys,
      getSnarkJs: this.getSnarkJs,
    });
  }

  initializeWithdraw(
    getWithdrawWasm: () => Promise<Uint8Array>,
    getWithdrawZkey: () => Promise<Uint8Array>
  ) {
    this.provingKeys.getWithdrawWasm = getWithdrawWasm;
    this.provingKeys.getWithdrawZkey = getWithdrawZkey;
    this.controller = new Controller({
      provingKeys: this.provingKeys,
      getSnarkJs: this.getSnarkJs,
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
    if (
      !this.provingKeys.getDepositWasm ||
      !this.provingKeys.getDepositZkey ||
      !this.provingKeys.getInputRootWasm ||
      !this.provingKeys.getInputRootZkey ||
      !this.provingKeys.getOutputRootWasm ||
      !this.provingKeys.getOutputRootZkey
    ) {
      throw new Error("Proof dependency getters not found");
    }

    const poolMatch = await this.poolMatch(currency);
    if (!poolMatch) {
      throw new Error(
        `Could not find a matching pool for ${currency}. Current network ID: ${await this.web3.eth.getChainId()}`
      );
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
    const { proofs, args } = await this.controller.deposit({
      account: account || new Account(),
      publicKey,
      amount: amountInUnits,
      debt,
      unitPerUnderlying,
      accountCommitments: await this.fetchAccountCommitments(currency),
    });
    return poof.methods[debt.eq(toBN(0)) ? "deposit" : "burn"](proofs, args);
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
    if (
      !this.provingKeys.getWithdrawWasm ||
      !this.provingKeys.getWithdrawZkey ||
      !this.provingKeys.getInputRootWasm ||
      !this.provingKeys.getInputRootZkey ||
      !this.provingKeys.getOutputRootWasm ||
      !this.provingKeys.getOutputRootZkey
    ) {
      throw new Error("Proof dependency getters not found");
    }

    const poolMatch = await this.poolMatch(currency);
    if (!poolMatch) {
      throw new Error(
        `Could not find a matching pool for ${currency}. Current network ID: ${await this.web3.eth.getChainId()}`
      );
    }

    const { poolAddress } = poolMatch;
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

    const { proofs, args } = await this.controller.withdraw({
      account: latestAccount,
      amount: amountInUnits,
      debt,
      unitPerUnderlying,
      recipient,
      publicKey,
      fee,
      relayer,
      accountCommitments: await this.fetchAccountCommitments(currency),
    });
    const isWithdraw = debt.eq(toBN(0));
    if (relayerURL) {
      console.info("Sending withdraw transaction through relay");
      try {
        const endpoint = isWithdraw ? "/v3/withdraw" : "/v3/mint";
        const relay = await axios.post(relayerURL + endpoint, {
          contract: poolAddress,
          proofs,
          args,
        });
        let tries = TRIES;
        while (tries > 0) {
          console.info(`Trying to fetch transaction hash, try #${tries}`);
          const job = await axios.get(relayerURL + `/v1/jobs/${relay.data.id}`);
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
        throw new Error(
          "Timed out. Did not get a transaction hash from the relayer."
        );
      } catch (e) {
        if (e.response) {
          console.error(e.response.data.error);
        } else {
          console.error(e.message);
        }
      }
    }
    return poof.methods[isWithdraw ? "withdraw" : "mint"](proofs, args);
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
        (await getPastEvents(
          poof,
          "NewAccount",
          poolMatch.creationBlock,
          await this.web3.eth.getBlockNumber()
        ));
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
      const eventCommitment = event.returnValues.commitment;
      let account = Account.decrypt(
        privateKey,
        unpackEncryptedMessage(event.returnValues.encryptedAccount)
      );
      let accountCommitment = toFixedHex(account.commitment);

      if (accountCommitment !== eventCommitment) {
        console.info(
          "Commitment mismatch. Trying to update with a negative debt"
        );
        account = new Account({
          amount: account.amount.toString(),
          debt: account.debt.mul(toBN(-1)).toString(),
          nullifier: account.nullifier.toString(),
          secret: account.secret.toString(),
        });
        accountCommitment = toFixedHex(account.commitment);
      }
      return account;
    }
    return null;
  }

  async fetchAccountCommitments(currency: string) {
    const poolMatch = await this.poolMatch(currency);
    if (poolMatch) {
      const poof = new this.web3.eth.Contract(
        PoofArtifact.abi,
        poolMatch.poolAddress
      );
      const events = await getPastEvents(
        poof,
        "NewAccount",
        poolMatch.creationBlock,
        await this.web3.eth.getBlockNumber()
      );
      return events
        .sort((a, b) => a.returnValues.index - b.returnValues.index)
        .map((e) => toBN(e.returnValues.commitment));
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
      const token = await poof.methods.token().call();
      return { token };
    }
    return null;
  }
}
