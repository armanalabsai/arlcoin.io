// Builds x402 v2 `upto` payment requirements priced in ARL.
//
// `amount` is the ceiling the payer signs (Permit2 `permitted.amount`). The facilitator later
// settles the metered amount, which can be lower but never higher (enforced by the proxy).

import type { PaymentRequirements } from "@x402/core/types";
import { getAddress } from "viem";

import { paymentNetwork } from "./networks.ts";

/** Longest authorization window accepted: a payment authorization should not outlive a request. */
export const MAX_AUTHORIZATION_SECONDS = 600;
export const MIN_AUTHORIZATION_SECONDS = 30;

export interface UptoRequirementsInput {
  chainId: number;
  /** The deployed ARL token. Taken from the deployment manifest, never guessed. */
  arlToken: string;
  /** Ceiling in ARL base units (18 decimals). */
  maxAmount: bigint;
  /** The service provider receiving the payment; bound into the signed witness. */
  payTo: string;
  /** The facilitator allowed to settle; bound into the signed witness. */
  facilitator: string;
  maxTimeoutSeconds: number;
}

export function buildUptoRequirements(input: UptoRequirementsInput): PaymentRequirements {
  const net = paymentNetwork(input.chainId);
  if (input.maxAmount <= 0n) throw new Error("maxAmount must be positive");
  if (
    !Number.isInteger(input.maxTimeoutSeconds) ||
    input.maxTimeoutSeconds < MIN_AUTHORIZATION_SECONDS ||
    input.maxTimeoutSeconds > MAX_AUTHORIZATION_SECONDS
  ) {
    throw new Error(
      `maxTimeoutSeconds must be an integer between ${String(MIN_AUTHORIZATION_SECONDS)} and ${String(MAX_AUTHORIZATION_SECONDS)}`,
    );
  }
  const arlToken = getAddress(input.arlToken);
  const payTo = getAddress(input.payTo);
  const facilitator = getAddress(input.facilitator);
  const zero = "0x0000000000000000000000000000000000000000";
  if (arlToken === zero || payTo === zero || facilitator === zero) {
    throw new Error("zero address in payment requirements");
  }
  return {
    scheme: "upto",
    network: net.network,
    asset: arlToken,
    amount: input.maxAmount.toString(),
    payTo,
    maxTimeoutSeconds: input.maxTimeoutSeconds,
    extra: { facilitatorAddress: facilitator },
  };
}
