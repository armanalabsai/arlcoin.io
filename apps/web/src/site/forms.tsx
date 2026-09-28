"use client";

import Link from "next/link";
import { useId, useState } from "react";

import {
  CONTACT_TOPICS,
  FORMS,
  formsOpen,
  isEmail,
  isEvmAddress,
  MESSAGE_MAX,
  toChecksumAddress,
} from "@/content/forms.ts";
import { SITE } from "@/content/site.ts";

type Status =
  { kind: "idle" } | { kind: "sending" } | { kind: "sent" } | { kind: "error"; message: string };

type Errors = Record<string, string>;

async function send(subject: string, fields: Record<string, string>): Promise<Status> {
  try {
    const res = await fetch(FORMS.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        access_key: FORMS.accessKey,
        subject,
        from_name: "arlcoin.io",
        ...fields,
      }),
    });
    const data = (await res.json().catch(() => null)) as { success?: boolean } | null;
    if (res.ok && data?.success) return { kind: "sent" };
    if (res.status === 429)
      return { kind: "error", message: "Too many requests. Try again in a few minutes." };
    return { kind: "error", message: "The form could not be sent. Try again later." };
  } catch {
    return {
      kind: "error",
      message: "The form could not be sent. Check your connection and try again.",
    };
  }
}

const input =
  "h-11 w-full rounded-(--radius-control) border border-line-strong bg-surface-1 px-3 text-[15px] text-fg placeholder:text-fg-subtle focus:border-accent-edge aria-[invalid=true]:border-[rgb(248_113_113/0.7)]";

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: (ids: { id: string; describedBy: string | undefined }) => React.ReactNode;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-[14px] font-medium">
        {label}
      </label>
      {children({ id, describedBy })}
      {hint ? (
        <p id={hintId} className="text-[13px] leading-[1.5] text-fg-subtle">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="text-[13px] text-[rgb(248_113_113)]">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function Check({
  name,
  error,
  children,
}: {
  name: string;
  error?: string;
  children: React.ReactNode;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label
        htmlFor={id}
        className="flex items-start gap-3 text-[14px] leading-[1.5] text-fg-muted"
      >
        <input
          id={id}
          name={name}
          type="checkbox"
          aria-invalid={error ? true : undefined}
          className="mt-[3px] size-4 shrink-0 accent-[var(--color-accent)]"
        />
        <span>{children}</span>
      </label>
      {error ? (
        <p role="alert" className="pl-7 text-[13px] text-[rgb(248_113_113)]">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Hidden spam trap: people never see it, bots fill it in. */
function Honeypot() {
  return (
    <input
      type="checkbox"
      name="botcheck"
      tabIndex={-1}
      autoComplete="off"
      aria-hidden="true"
      className="hidden"
      style={{ display: "none" }}
    />
  );
}

function Submit({ status, label }: { status: Status; label: string }) {
  return (
    <div className="flex flex-col gap-3">
      <button
        type="submit"
        disabled={status.kind === "sending"}
        className="inline-flex h-11 items-center justify-center rounded-(--radius-control) bg-accent px-5 text-[15px] font-medium text-[#1a1203] transition-colors hover:bg-accent-strong disabled:opacity-60 sm:self-start"
      >
        {status.kind === "sending" ? "Sending…" : label}
      </button>
      {status.kind === "error" ? (
        <p role="alert" className="text-[14px] text-[rgb(248_113_113)]">
          {status.message}
        </p>
      ) : null}
    </div>
  );
}

function Done({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      role="status"
      className="flex flex-col gap-2 rounded-2xl border border-accent-edge bg-accent-faint p-6"
    >
      <h2 className="text-[17px] font-medium">{title}</h2>
      <p className="text-[14px] leading-[1.6] text-fg-muted">{children}</p>
    </div>
  );
}

function Closed({ children }: { children: React.ReactNode }) {
  return (
    <div
      data-testid="form-closed"
      className="flex flex-col gap-2 rounded-2xl border border-line-strong bg-surface-1/70 p-6 text-[14px] leading-[1.6] text-fg-muted"
    >
      {children}
    </div>
  );
}

const value = (form: FormData, name: string) => String(form.get(name) ?? "").trim();

export function WhitelistForm() {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [errors, setErrors] = useState<Errors>({});

  if (!formsOpen()) {
    return (
      <Closed>
        <p className="font-medium text-fg">Registration is not open yet.</p>
        <p>
          The form opens here once registration starts. No other site or account takes
          registrations.
        </p>
      </Closed>
    );
  }
  if (status.kind === "sent") {
    return (
      <Done title="You are registered">
        Your address was recorded. Launch updates will come from the email address you entered.
        Registering again with the same address changes nothing.
      </Done>
    );
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    if (form.get("botcheck")) return;
    const address = value(form, "wallet");
    const email = value(form, "email");
    const next: Errors = {};
    if (!isEvmAddress(address))
      next.wallet = "Enter a valid EVM address: 0x followed by 40 hex characters.";
    if (!isEmail(email)) next.email = "Enter a valid email address.";
    if (!form.get("no_guarantee")) next.no_guarantee = "Confirm this to register.";
    if (!form.get("privacy")) next.privacy = "Confirm this to register.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    setStatus({ kind: "sending" });
    setStatus(
      await send("ARL whitelist registration", { wallet: toChecksumAddress(address), email }),
    );
  }

  return (
    <form
      noValidate
      onSubmit={onSubmit}
      className="flex flex-col gap-6"
      aria-label="Whitelist registration"
    >
      <Honeypot />
      <Field
        label="Wallet address"
        hint="An EVM address you control, such as a MetaMask, Rabby or Coinbase Wallet address. Not an exchange deposit address."
        error={errors.wallet}
      >
        {({ id, describedBy }) => (
          <input
            id={id}
            name="wallet"
            inputMode="text"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            placeholder="0x…"
            aria-invalid={errors.wallet ? true : undefined}
            aria-describedby={describedBy}
            className={`${input} font-mono text-[14px]`}
          />
        )}
      </Field>
      <Field label="Email" hint="Used only for launch updates." error={errors.email}>
        {({ id, describedBy }) => (
          <input
            id={id}
            name="email"
            type="email"
            autoComplete="email"
            aria-invalid={errors.email ? true : undefined}
            aria-describedby={describedBy}
            className={input}
          />
        )}
      </Field>
      <div className="flex flex-col gap-3">
        <Check name="no_guarantee" error={errors.no_guarantee}>
          I understand that registering does not guarantee an allocation, and that ARL will never
          ask for my private key, seed phrase or a payment.
        </Check>
        <Check name="privacy" error={errors.privacy}>
          I have read the{" "}
          <Link
            href="/privacy"
            prefetch={false}
            className="text-accent underline-offset-4 hover:underline"
          >
            privacy notice
          </Link>
          .
        </Check>
      </div>
      <Submit status={status} label="Register" />
    </form>
  );
}

export function ContactForm() {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [errors, setErrors] = useState<Errors>({});
  const [length, setLength] = useState(0);

  if (!formsOpen()) {
    return (
      <Closed>
        <p className="font-medium text-fg">Write to the team by email.</p>
        <p>
          <a
            href={`mailto:${SITE.email}`}
            className="text-accent underline-offset-4 hover:underline"
          >
            {SITE.email}
          </a>
        </p>
        <p>The contact form will open here soon.</p>
      </Closed>
    );
  }
  if (status.kind === "sent") {
    return (
      <Done title="Message sent">
        Thank you. Replies come from the team to the email address you entered.
      </Done>
    );
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    if (form.get("botcheck")) return;
    const name = value(form, "name").slice(0, 100);
    const email = value(form, "email");
    const topic = value(form, "topic");
    const message = value(form, "message");
    const next: Errors = {};
    if (!isEmail(email)) next.email = "Enter a valid email address.";
    if (!(CONTACT_TOPICS as readonly string[]).includes(topic)) next.topic = "Choose a topic.";
    if (message.length < 10) next.message = "Write at least a sentence.";
    if (message.length > MESSAGE_MAX)
      next.message = `Keep the message under ${MESSAGE_MAX} characters.`;
    if (!form.get("privacy")) next.privacy = "Confirm this to send.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    setStatus({ kind: "sending" });
    setStatus(await send(`ARL contact: ${topic}`, { name, email, topic, message }));
  }

  return (
    <form noValidate onSubmit={onSubmit} className="flex flex-col gap-6" aria-label="Contact">
      <Honeypot />
      <Field label="Name (optional)">
        {({ id, describedBy }) => (
          <input
            id={id}
            name="name"
            autoComplete="name"
            maxLength={100}
            aria-describedby={describedBy}
            className={input}
          />
        )}
      </Field>
      <Field label="Email" hint="Used only to reply to you." error={errors.email}>
        {({ id, describedBy }) => (
          <input
            id={id}
            name="email"
            type="email"
            autoComplete="email"
            aria-invalid={errors.email ? true : undefined}
            aria-describedby={describedBy}
            className={input}
          />
        )}
      </Field>
      <Field label="Topic" error={errors.topic}>
        {({ id, describedBy }) => (
          <select
            id={id}
            name="topic"
            defaultValue=""
            aria-invalid={errors.topic ? true : undefined}
            aria-describedby={describedBy}
            className={input}
          >
            <option value="" disabled>
              Choose a topic
            </option>
            {CONTACT_TOPICS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field label="Message" hint={`${length} / ${MESSAGE_MAX}`} error={errors.message}>
        {({ id, describedBy }) => (
          <textarea
            id={id}
            name="message"
            rows={6}
            maxLength={MESSAGE_MAX}
            onChange={(e) => setLength(e.currentTarget.value.length)}
            aria-invalid={errors.message ? true : undefined}
            aria-describedby={describedBy}
            className={`${input} h-auto min-h-36 py-3 leading-[1.5]`}
          />
        )}
      </Field>
      <Check name="privacy" error={errors.privacy}>
        I have read the{" "}
        <Link
          href="/privacy"
          prefetch={false}
          className="text-accent underline-offset-4 hover:underline"
        >
          privacy notice
        </Link>
        .
      </Check>
      <Submit status={status} label="Send message" />
    </form>
  );
}
