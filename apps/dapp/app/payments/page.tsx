"use client";

import type { SettleResponse } from "@x402/core/types";
import { UptoEvmScheme, toFacilitatorEvmSigner } from "@x402/evm";
import type { ClientEvmSigner } from "@x402/evm";
import { UptoEvmScheme as UptoFacilitator } from "@x402/evm/upto/facilitator";
import { useState } from "react";
import { createWalletClient, http, publicActions } from "viem";
import type { Address } from "viem";
import { useAccount, useWalletClient, useWriteContract } from "wagmi";

import {
  AmountForm,
  Facts,
  Arl,
  PageTitle,
  RequireWallet,
  Stat,
  useChainTime,
} from "~~/components/arl/ui";
import {
  useDeployedContractInfo,
  useScaffoldReadContract,
  useScaffoldWriteContract,
  useTargetNetwork,
  useTransactor,
} from "~~/hooks/scaffold-eth";
import { formatArl, timeLeft } from "~~/lib/format";
import {
  DEMO_FACILITATOR,
  DEMO_SERVICE,
  DEMO_UNIT_PRICE,
  PERMIT2,
  meter,
  nonceBitmap,
  permit2Abi,
  uptoRequirements,
} from "~~/lib/payments";
import type { SignedCeiling } from "~~/lib/payments";
import { notification } from "~~/utils/scaffold-eth";

const WINDOW_SECONDS = 300;

type Outcome =
  | { kind: "settled"; amount: bigint; transaction: string }
  | { kind: "nothing" }
  | { kind: "cancelled" }
  | { kind: "failed"; reason: string };

export default function PaymentsPage() {
  return (
    <>
      <PageTitle title="Payments">
        Pay for usage in ARL with x402. You sign a ceiling once; the service charges what you
        actually used, never more than the ceiling, and the contracts enforce it.
      </PageTitle>
      <RequireWallet>
        <Payments />
      </RequireWallet>
    </>
  );
}

function Payments() {
  const { address } = useAccount();
  const { data: token } = useDeployedContractInfo({ contractName: "ARLToken" });
  const { data: balance } = useScaffoldReadContract({
    contractName: "ARLToken",
    functionName: "balanceOf",
    args: [address],
  });
  const { data: allowance } = useScaffoldReadContract({
    contractName: "ARLToken",
    functionName: "allowance",
    args: [address, PERMIT2],
  });
  const { data: serviceBalance } = useScaffoldReadContract({
    contractName: "ARLToken",
    functionName: "balanceOf",
    args: [DEMO_SERVICE],
  });
  const arl = useScaffoldWriteContract({ contractName: "ARLToken" });

  return (
    <div className="flex flex-col gap-6">
      <section className="glass-strong flex flex-col gap-4 p-5">
        <div>
          <h2 className="text-sm font-semibold">1 · Payment limit</h2>
          <p className="mt-1 text-sm text-muted">
            x402 payments move ARL through Permit2. This sets the most Permit2 may ever move from
            your wallet; each payment still needs your signature.
          </p>
        </div>
        <Facts inset>
          <Stat
            label="Current limit"
            value={<Arl value={allowance} />}
            testId="permit2-allowance"
          />
          <Stat label="Wallet balance" value={<Arl value={balance} />} />
        </Facts>
        <AmountForm
          label="New limit"
          action="Set limit"
          available={balance}
          busy={arl.isMining}
          testId="limit"
          onSubmit={async (amount) => {
            await arl.writeContractAsync({ functionName: "approve", args: [PERMIT2, amount] });
          }}
        />
        <button
          type="button"
          className="btn btn-glass btn-sm self-start"
          data-testid="limit-revoke"
          disabled={!allowance || arl.isMining}
          onClick={() =>
            void arl.writeContractAsync({ functionName: "approve", args: [PERMIT2, 0n] })
          }
        >
          Remove limit
        </button>
      </section>

      {token && address ? (
        <UsageDemo
          payer={address}
          arl={token.address}
          spendable={
            balance !== undefined && allowance !== undefined
              ? balance < allowance
                ? balance
                : allowance
              : undefined
          }
          serviceBalance={serviceBalance}
        />
      ) : null}
    </div>
  );
}

function UsageDemo({
  payer,
  arl,
  spendable,
  serviceBalance,
}: {
  payer: Address;
  arl: Address;
  spendable: bigint | undefined;
  serviceBalance: bigint | undefined;
}) {
  const { targetNetwork } = useTargetNetwork();
  const { data: walletClient } = useWalletClient();
  const now = useChainTime();
  const { writeContractAsync } = useWriteContract();
  const transact = useTransactor();
  const [signed, setSigned] = useState<SignedCeiling>();
  const [outcome, setOutcome] = useState<Outcome>();
  const [units, setUnits] = useState("");
  const [busy, setBusy] = useState(false);

  const unitCount = /^\d+$/.test(units.trim()) ? BigInt(units.trim()) : undefined;
  const metered =
    signed && unitCount !== undefined
      ? meter(DEMO_UNIT_PRICE, unitCount, signed.ceiling)
      : undefined;
  const expired = !!signed && now !== undefined && now >= signed.deadline;

  const sign = async (ceiling: bigint) => {
    if (!walletClient) return;
    const requirements = uptoRequirements({
      chainId: targetNetwork.id,
      arl,
      ceiling,
      payTo: DEMO_SERVICE,
      facilitator: DEMO_FACILITATOR,
      windowSeconds: WINDOW_SECONDS,
    });
    const signer: ClientEvmSigner = {
      address: payer,
      signTypedData: (message) =>
        walletClient.signTypedData({ account: payer, ...message } as Parameters<
          typeof walletClient.signTypedData
        >[0]),
    };
    const client = new UptoEvmScheme(signer);
    try {
      const result = await client.createPaymentPayload(2, requirements);
      const auth = (result.payload as { permit2Authorization: { nonce: string; deadline: string } })
        .permit2Authorization;
      setSigned({
        payload: { x402Version: 2, accepted: requirements, payload: result.payload },
        requirements,
        nonce: BigInt(auth.nonce),
        deadline: BigInt(auth.deadline),
        ceiling,
      });
      setOutcome(undefined);
      setUnits("");
    } catch (e) {
      notification.error(e instanceof Error ? e.message.split("\n")[0] : "Signing failed");
    }
  };

  // The service side. On a public network this runs on the service's server with its own
  // facilitator; here it is Anvil development account 4, which the local node unlocks.
  const settle = async () => {
    if (!signed || !metered) return;
    setBusy(true);
    try {
      const wallet = createWalletClient({
        account: DEMO_FACILITATOR,
        chain: targetNetwork,
        transport: http(targetNetwork.rpcUrls.default.http[0]),
      }).extend(publicActions);
      type SignerInput = Parameters<typeof toFacilitatorEvmSigner>[0];
      const facilitator = new UptoFacilitator(
        toFacilitatorEvmSigner({ ...wallet, address: DEMO_FACILITATOR } as unknown as SignerInput),
      );
      const verified = await facilitator.verify(signed.payload, signed.requirements);
      if (!verified.isValid) {
        setOutcome({ kind: "failed", reason: verified.invalidReason ?? "invalid authorization" });
        return;
      }
      const result: SettleResponse = await facilitator.settle(signed.payload, {
        ...signed.requirements,
        amount: metered.amount.toString(),
      });
      if (!result.success)
        setOutcome({ kind: "failed", reason: result.errorReason ?? "settlement failed" });
      else if (metered.amount === 0n || !result.transaction) setOutcome({ kind: "nothing" });
      else setOutcome({ kind: "settled", amount: metered.amount, transaction: result.transaction });
    } catch (e) {
      setOutcome({
        kind: "failed",
        reason: e instanceof Error ? e.message.split("\n")[0] : "settlement failed",
      });
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (!signed) return;
    const { wordPos, mask } = nonceBitmap(signed.nonce);
    setBusy(true);
    try {
      const hash = await transact(() =>
        writeContractAsync({
          address: PERMIT2,
          abi: permit2Abi,
          functionName: "invalidateUnorderedNonces",
          args: [wordPos, mask],
        }),
      );
      if (hash) setOutcome({ kind: "cancelled" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="glass-strong flex flex-col gap-4 p-5">
      <div>
        <h2 className="text-sm font-semibold">2 · Try a usage-based payment</h2>
        <p className="mt-1 text-sm text-muted">
          A demo AI service charges {formatArl(DEMO_UNIT_PRICE)} ARL per unit of usage. Local test
          chain only: the service and its facilitator are local development accounts.
        </p>
      </div>

      {!signed || outcome ? (
        <AmountForm
          label="Ceiling for this session"
          action="Sign ceiling"
          available={spendable}
          busy={busy}
          testId="ceiling"
          onSubmit={sign}
        />
      ) : null}
      {spendable === 0n ? (
        <p className="text-xs text-warning">Set a payment limit first (step 1).</p>
      ) : null}

      {signed ? (
        <div className="glass-chip flex flex-col gap-3 p-4" data-testid="authorization">
          <div className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <span className="text-subtle">Ceiling</span> <Arl value={signed.ceiling} />
            </div>
            <div>
              <span className="text-subtle">Expires</span>{" "}
              {expired
                ? "expired"
                : now !== undefined
                  ? `in ${timeLeft(now, signed.deadline)}`
                  : "…"}
            </div>
            <div className="truncate">
              <span className="text-subtle">Pays</span>{" "}
              <span className="font-mono text-xs">{DEMO_SERVICE}</span>
            </div>
            <div className="truncate">
              <span className="text-subtle">Settled by</span>{" "}
              <span className="font-mono text-xs">{DEMO_FACILITATOR}</span>
            </div>
          </div>

          {!outcome ? (
            <>
              <label className="text-sm text-muted" htmlFor="units">
                Usage the service measured (units)
              </label>
              <div className="join w-full">
                <input
                  id="units"
                  data-testid="units-input"
                  className="input glass-field join-item w-full"
                  inputMode="numeric"
                  placeholder="0"
                  value={units}
                  onChange={(e) => setUnits(e.target.value)}
                />
                <button
                  type="button"
                  className="btn btn-primary join-item"
                  data-testid="settle"
                  disabled={!metered || busy || expired}
                  onClick={() => void settle()}
                >
                  {busy ? <span className="loading loading-spinner loading-sm" /> : "Charge"}
                </button>
              </div>
              {metered ? (
                <p className="text-xs text-muted" data-testid="metered">
                  Charge: {formatArl(metered.amount)} ARL
                  {metered.capped ? " (capped at the ceiling)" : ""}
                </p>
              ) : null}
              <button
                type="button"
                className="btn btn-glass btn-sm self-start"
                data-testid="cancel"
                disabled={busy || expired}
                onClick={() => void cancel()}
              >
                Cancel this authorization
              </button>
            </>
          ) : (
            <p className="text-sm" data-testid="outcome">
              {outcome.kind === "settled"
                ? `Paid ${formatArl(outcome.amount)} ARL of the ${formatArl(signed.ceiling)} ARL ceiling. The authorization is used up.`
                : outcome.kind === "nothing"
                  ? "Nothing to pay: no transaction was sent, and the authorization is not used."
                  : outcome.kind === "cancelled"
                    ? "Cancelled: the service can no longer charge this authorization."
                    : `Not charged: ${outcome.reason}`}
            </p>
          )}
        </div>
      ) : null}

      <Facts inset>
        <Stat
          label="Demo service has received"
          value={<Arl value={serviceBalance} />}
          testId="service-balance"
        />
      </Facts>
    </section>
  );
}
