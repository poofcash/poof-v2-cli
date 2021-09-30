import { toBN, AbiItem, fromWei } from "web3-utils";
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
      (e) =>
        e.symbol.toLowerCase() === currency.toLowerCase() ||
        e.pSymbol.toLowerCase() === currency.toLowerCase()
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
        await this.initializeDeposit();
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
    recipient: Address,
    relayerURL?: string,
    accountEvents?: EventData[]
  ) {
    const poolMatch = await this.poolMatch(currency);
    if (poolMatch) {
      const { poolAddress } = poolMatch;

      if (!this.provingKeys.withdrawWasm || !this.provingKeys.withdrawZkey) {
        await this.initializeWithdraw();
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
        throw new Error("Poof account has no AP");
      }
      const publicKey = getEncryptionPublicKey(privateKey);
      let fee = toBN(0);
      let relayer: Address;
      if (relayerURL) {
        const relayerStatus = await axios.get(relayerURL + "/status");
        const { celoPrices, rewardAccount, poofServiceFee } =
          relayerStatus.data;
        const currencyCeloPrice = celoPrices[currency.toLowerCase()];
        // Fee can come from amount or debt
        const feeFrom = amountInUnits.eq(toBN(0)) ? debt : amountInUnits; // HARDCODE: 18 decimal assumption
        fee = calculateFee(
          feeFrom,
          Number(currencyCeloPrice),
          poofServiceFee,
          1e6
        );
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
      // const req = {
      //   contract: "0xE13fAC418766bbae1e84b21A7e0F9819fB28C025",
      //   proof:
      //     "0x11f3eb2b4a8c1e36cbdede269de588fa42c2ee0f29e53b85d96eaf1d897c0d6a037e3d14d7d3bb7c584f95f1c70c86c6850cf20bc9e595c96327d42ad6d82323289d06a4c7afca43dcee29f3741fa9890bf8b8e0f308c4e10ecaf1396c47663302bca2d405e6c2be8feb3f3546abc72119cb85235594b932e6cc355425b7106215374215b387ace2c877504636df56357e6d01ec8fa79e063723610fa83f7b3926fc8db3914840d73df324f47847950773f93fbbaac3a27986284e545509416e1664c87ca127ea230ce18a5805ea0541964a63cfe016232041a31484261e47ff085aad61a87974400a8561ce812ba1cce4c39889d01b1d0fef3b78ad4a76b4db073c547bc323f220c92e535c7a26c3b0e759f1669c6657ae0513399bf5a0a3f31c0931187078b7f1b7f01ce06955cd57468e45beea60fc5041356132e7b8123e1f654ccfb0b6e125483bf648d396ea8cc2d7f31081b514c825d63bed5ba9184b19456c78230c076792c9fbde92803e7f94adc0fee90bbb1c7f647d0e6a3d99e32640456c9599b9f080bf4e85a63054df545da367cc779d5c3be556198ec153df059664533e0a964e62e26355f899602566b60d4ee0f8be555c52194882b5695c304760e39fe45f4c13b30fc95ba21c7d6f46fe661937ebbb579d4c634b69ff1a30335b93c707d87bb636276a4fa7d99c3bf26e2a0196846ff67eb27ade212cb510f0bf1b14bf751b89b29846b4b40bac9f79faf5f179ead57cc5608cb9e626ad152de6889055afc9b4000f78e997138cec0890807d7a62e59b49d11a20a2e16b0254d39d0e9b4c5808dc25e1824e84a8b50b40e108ef513e3c277c37713765481b298623b8b6e0336cfde72400beee97162fff1b5e8f650b60e4c74f4c66adcb1fdba8021426e2e791cfeca977f2a611ecb20ba84e393f590e56a1917d83411507b6d87a709fb33b4476780c739aa2c4c3002ada7d40ce66cd523128bae902f82052f32a7d8a63f14806b25c076bb1337d0faa9538aee27ee4a474e055e5ce1b15fc35780acd23f79e7c06a8d41b787ba255f0174e38ef0be1681c31f44b4d000516abd1d92d34f0f9b3dff4ffdfc28a19f53c3fb2509acdaa42a49aa7943038",
      //   args: {
      //     amount:
      //       "0x0000000000000000000000000000000000000000000000000001cc36a24d8400",
      //     debt: "0x000000000000000000000000000000000000000000000000002386f26fc10000",
      //     unitPerUnderlying:
      //       "0x0000000000000000000000000000000000000000000000000de0b672d5120626",
      //     extDataHash:
      //       "0x002315d0b4a77856965c00787a98cb48e2372c138a125c40c678eba92bdd242b",
      //     extData: {
      //       fee: "0x0000000000000000000000000000000000000000000000000001cc36a24d8400",
      //       recipient: "0x4C828d2A58B747De3598C2Ce18a0908b0e78dC3e",
      //       relayer: "0x4C828d2A58B747De3598C2Ce18a0908b0e78dC3e",
      //       depositProofHash:
      //         "0x0000000000000000000000000000000000000000000000000000000000000000",
      //       encryptedAccount:
      //         "0x37dc5769407062c1efb87e2b1427847288d4c2f41a1115b766fa8aa7bfe2e566a7f7c8ad18859d7515f2c2f5d1add892224efda07cc86042cea644f365f09e5565fde81242d0c2173da66bd6cf82188158d36080526d3ea9dafd527b62cdb94f4a46b7f6eb26ed1765f7a9a85c9a88a2bbabc5a324554fec39b13581c0a908d08f91781542938b1c167d47fce904ddbce7799359e7a1a156e0501ba513496fcf62f91e6ac8e26c11f7879a9d50417b53feca32073345fa1d337f60e957f30d4c8a5201d31c2a368906230634f7032c357fe019d8a8967591d75b6d296219e74c93ba35a9776a80fdf1e01c2acc99a59a",
      //     },
      //     account: {
      //       inputRoot:
      //         "0x1de5b14cefcbdc3307e5994f405cb2b07ef70d84ed3028f1b697be0fb0da0d6a",
      //       inputNullifierHash:
      //         "0x04adfbf23570655cff3cd5190ecab89ce7acfc71c84ab359a7f30595c8ea85f3",
      //       outputRoot:
      //         "0x052dc5758f28c0e556c8992f5801085cd01a02be9cb257baac0c449803c909ec",
      //       outputPathIndices:
      //         "0x0000000000000000000000000000000000000000000000000000000000000007",
      //       outputCommitment:
      //         "0x277848666df105239d002d4aa808611cc073762ca65659159d0c7f98f3a39ed1",
      //     },
      //   },
      // };
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
