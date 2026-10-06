// Wraps the x402 SDK upto facilitator with ARL's network gate, asset pin and settlement policy.
//
// The SDK (`@x402/evm/upto/facilitator`) verifies the payload and sends the settlement through
// the pinned x402UptoPermit2Proxy. This wrapper refuses anything that is not ARL on Base Sepolia,
// and applies `decideSettlement` before any settlement is sent.

import type {
  PaymentPayload,
  PaymentRequirements,
  SettleResponse,
  VerifyResponse,
} from "@x402/core/types";
import { getAddress } from "viem";

import { paymentNetwork, type PaymentNetwork } from "./networks.ts";
import { decideSettlement, readAuthorization, type AuthorizationStore } from "./policy.ts";

/** The two SDK facilitator methods ARL uses. */
export interface UptoScheme {
  verify(payload: PaymentPayload, requirements: PaymentRequirements): Promise<VerifyResponse>;
  settle(payload: PaymentPayload, requirements: PaymentRequirements): Promise<SettleResponse>;
}

export interface ArlFacilitatorConfig {
  chainId: number;
  /** The deployed ARL token, from the deployment manifest. */
  arlToken: string;
  scheme: UptoScheme;
  store: AuthorizationStore;
  nowSeconds?: () => number;
}

export class ArlUptoFacilitator {
  readonly #net: PaymentNetwork;
  readonly #arlToken: string;
  readonly #scheme: UptoScheme;
  readonly #store: AuthorizationStore;
  readonly #now: () => number;

  constructor(config: ArlFacilitatorConfig) {
    this.#net = paymentNetwork(config.chainId);
    this.#arlToken = getAddress(config.arlToken);
    this.#scheme = config.scheme;
    this.#store = config.store;
    this.#now = config.nowSeconds ?? (() => Math.floor(Date.now() / 1000));
  }

  #check(payload: PaymentPayload, requirements: PaymentRequirements): string | undefined {
    if (requirements.scheme !== "upto" || payload.accepted.scheme !== "upto") return "arl_scheme";
    if (
      requirements.network !== this.#net.network ||
      payload.accepted.network !== this.#net.network
    ) {
      return "arl_network";
    }
    if (getAddress(requirements.asset) !== this.#arlToken) return "arl_asset";
    const auth = readAuthorization(payload.payload);
    if (getAddress(auth.permitted.token) !== this.#arlToken) return "arl_asset";
    if (getAddress(auth.spender) !== getAddress(this.#net.uptoProxy)) return "arl_spender";
    return undefined;
  }

  async verify(
    payload: PaymentPayload,
    requirements: PaymentRequirements,
  ): Promise<VerifyResponse> {
    const reason = this.#check(payload, requirements);
    if (reason) return { isValid: false, invalidReason: reason };
    return this.#scheme.verify(payload, requirements);
  }

  /** `requirements.amount` is the metered amount to settle (at most the signed ceiling). */
  async settle(
    payload: PaymentPayload,
    requirements: PaymentRequirements,
  ): Promise<SettleResponse> {
    const failed = (errorReason: string): SettleResponse => ({
      success: false,
      errorReason,
      transaction: "",
      network: this.#net.network,
    });
    const reason = this.#check(payload, requirements);
    if (reason) return failed(reason);

    const auth = readAuthorization(payload.payload);
    const decision = await decideSettlement({
      chainId: this.#net.chainId,
      auth,
      amount: BigInt(requirements.amount),
      nowSeconds: this.#now(),
      store: this.#store,
    });
    if (decision.action === "refuse") return failed(`arl_policy: ${decision.reason}`);
    if (decision.action === "retire") {
      await this.#store.claim(decision.key, "retired");
      return { success: true, transaction: "", network: this.#net.network, amount: "0" };
    }

    // Claim before sending, so two concurrent requests cannot both settle one authorization.
    await this.#store.claim(decision.key, "settling");
    let result: SettleResponse;
    try {
      result = await this.#scheme.settle(payload, requirements);
    } catch (error) {
      await this.#store.finish(decision.key, "failed");
      throw error;
    }
    await this.#store.finish(decision.key, result.success ? "settled" : "failed");
    return result;
  }
}
