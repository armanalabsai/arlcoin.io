"use client";

import Link from "next/link";
import { useState } from "react";
import { isAddress } from "viem";
import type { Address } from "viem";
import { useAccount, useWriteContract } from "wagmi";

import { Facts, PageTitle, RequireWallet, Stat } from "~~/components/arl/ui";
import { useArlServices } from "~~/hooks/arl/useArlServices";
import type { ListedService } from "~~/hooks/arl/useArlServices";
import { useDeployedContractInfo, useTargetNetwork, useTransactor } from "~~/hooks/scaffold-eth";
import { formatArl, parseArl } from "~~/lib/format";
import {
  IDENTITY_REGISTRY,
  LIMITS,
  encodeRegistration,
  identityRegistryAbi,
  validateService,
} from "~~/lib/registry";

export default function NetworkPage() {
  return (
    <>
      <PageTitle title="Network">
        AI and compute services priced in ARL. Services are registered on ERC-8004, the open
        registry for agents and services; each one states its price per unit and who settles its
        payments.
      </PageTitle>
      <RequireWallet>
        <Network />
      </RequireWallet>
    </>
  );
}

function Network() {
  const { data: services, isLoading } = useArlServices();
  return (
    <div className="flex flex-col gap-6">
      <section className="glass-strong flex flex-col gap-3 p-5" aria-labelledby="services-heading">
        <h2 id="services-heading" className="text-sm font-semibold">
          Services
        </h2>
        {isLoading ? (
          <p className="text-sm text-subtle">reading the registry</p>
        ) : !services?.length ? (
          <p className="text-sm text-muted">No ARL services are registered on this chain yet.</p>
        ) : (
          <ul
            className="divide-y divide-white/8 rounded-xl border border-white/10"
            data-testid="service-list"
          >
            {services.map((s) => (
              <ServiceRow key={s.agentId.toString()} service={s} />
            ))}
          </ul>
        )}
      </section>
      <RegisterForm />
    </div>
  );
}

function ServiceRow({ service }: { service: ListedService }) {
  const { address } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const transact = useTransactor();
  const mine = !!address && service.owner.toLowerCase() === address.toLowerCase();
  return (
    <li
      className="flex flex-col gap-2 px-4 py-3"
      data-testid={`service-${service.agentId.toString()}`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-semibold">{service.name}</span>
        <span className="text-sm">
          {formatArl(service.terms.unitPrice, 6)}{" "}
          <span className="text-xs text-muted">ARL per {service.terms.unit}</span>
        </span>
      </div>
      {service.description ? <p className="text-sm text-muted">{service.description}</p> : null}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-subtle">
        <span>Agent #{service.agentId.toString()}</span>
        <span className="font-mono">
          Provider {service.owner.slice(0, 6)}…{service.owner.slice(-4)}
        </span>
        <a
          className="link"
          href={service.endpoint}
          rel="noopener noreferrer nofollow"
          target="_blank"
        >
          {new URL(service.endpoint).host}
        </a>
      </div>
      <div className="flex gap-2">
        <Link
          className="btn btn-primary btn-sm"
          href={`/payments?service=${service.agentId.toString()}`}
          data-testid={`pay-${service.agentId.toString()}`}
        >
          Pay with ARL
        </Link>
        {mine ? (
          <button
            type="button"
            className="btn btn-glass btn-sm"
            data-testid={`deactivate-${service.agentId.toString()}`}
            onClick={() =>
              void transact(() =>
                writeContractAsync({
                  address: IDENTITY_REGISTRY,
                  abi: identityRegistryAbi,
                  functionName: "setAgentURI",
                  args: [service.agentId, encodeRegistration(service, false)],
                }),
              )
            }
          >
            Take offline
          </button>
        ) : null}
      </div>
    </li>
  );
}

function RegisterForm() {
  const { address } = useAccount();
  const { targetNetwork } = useTargetNetwork();
  const { data: token } = useDeployedContractInfo({ contractName: "ARLToken" });
  const { writeContractAsync } = useWriteContract();
  const transact = useTransactor();
  const [form, setForm] = useState({
    name: "",
    description: "",
    endpoint: "",
    unit: "",
    price: "",
    payTo: "",
    facilitator: "",
  });
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm({ ...form, [k]: e.target.value });

  const submit = async () => {
    if (!token || !address) return;
    setError(undefined);
    const price = parseArl(form.price);
    if (!price.ok) return setError(`Price: ${price.error}`);
    const payTo = form.payTo.trim() || address;
    const facilitator = form.facilitator.trim() || address;
    for (const [label, v] of [
      ["Paid to", payTo],
      ["Settled by", facilitator],
    ] as const) {
      if (!isAddress(v)) return setError(`${label}: not an address`);
    }
    let uri: string;
    try {
      uri = encodeRegistration(
        validateService({
          name: form.name,
          description: form.description,
          endpoint: form.endpoint,
          terms: {
            network: `eip155:${String(targetNetwork.id)}`,
            asset: token.address,
            unitPrice: price.value,
            unit: form.unit,
            payTo: payTo as Address,
            facilitator: facilitator as Address,
          },
        }),
      );
    } catch (e) {
      return setError(e instanceof Error ? e.message : "invalid service");
    }
    setBusy(true);
    try {
      const hash = await transact(() =>
        writeContractAsync({
          address: IDENTITY_REGISTRY,
          abi: identityRegistryAbi,
          functionName: "register",
          args: [uri],
        }),
      );
      if (hash)
        setForm({
          name: "",
          description: "",
          endpoint: "",
          unit: "",
          price: "",
          payTo: "",
          facilitator: "",
        });
    } finally {
      setBusy(false);
    }
  };

  const field = "input glass-field w-full";
  return (
    <section className="glass-strong flex flex-col gap-3 p-5" aria-labelledby="register-heading">
      <div>
        <h2 id="register-heading" className="text-sm font-semibold">
          Offer a service
        </h2>
        <p className="mt-1 text-sm text-muted">
          Registers your service as an ERC-8004 agent owned by your wallet. The registration file is
          stored on-chain and lists your price in ARL. You can take it offline later.
        </p>
      </div>
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <label className="flex flex-col gap-1 text-sm text-muted">
          Name
          <input
            className={field}
            maxLength={LIMITS.name}
            value={form.name}
            onChange={set("name")}
            data-testid="svc-name"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-muted">
          Endpoint (https)
          <input
            className={field}
            maxLength={LIMITS.endpoint}
            value={form.endpoint}
            onChange={set("endpoint")}
            placeholder="https://"
            data-testid="svc-endpoint"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-muted sm:col-span-2">
          Description
          <textarea
            className="textarea glass-field w-full"
            maxLength={LIMITS.description}
            value={form.description}
            onChange={set("description")}
            data-testid="svc-description"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-muted">
          Price per unit (ARL)
          <input
            className={field}
            inputMode="decimal"
            value={form.price}
            onChange={set("price")}
            placeholder="0.001"
            data-testid="svc-price"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-muted">
          Unit
          <input
            className={field}
            maxLength={LIMITS.unit}
            value={form.unit}
            onChange={set("unit")}
            placeholder="1,000 tokens"
            data-testid="svc-unit"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-muted">
          Paid to (default: your wallet)
          <input
            className={`${field} font-mono text-xs`}
            value={form.payTo}
            onChange={set("payTo")}
            placeholder={address}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-muted">
          Settled by (default: your wallet)
          <input
            className={`${field} font-mono text-xs`}
            value={form.facilitator}
            onChange={set("facilitator")}
            placeholder={address}
          />
        </label>
        {error ? (
          <p className="text-xs text-error sm:col-span-2" data-testid="svc-error">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          className="btn btn-primary justify-self-start"
          disabled={busy || !token}
          data-testid="svc-submit"
        >
          {busy ? <span className="loading loading-spinner loading-sm" /> : "Register service"}
        </button>
      </form>
      <Facts inset>
        <Stat
          label="Registry"
          value={<span className="font-mono text-xs">{IDENTITY_REGISTRY}</span>}
        />
        <Stat
          label="Standard"
          value={<span className="text-sm font-normal">ERC-8004 registration-v1</span>}
        />
      </Facts>
    </section>
  );
}
