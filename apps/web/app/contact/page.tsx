import type { Metadata } from "next";
import Link from "next/link";

import { OG_IMAGE, repoDoc, SITE } from "@/content/site.ts";
import { FactList, PageShell } from "@/site/PageShell.tsx";
import { ContactForm } from "@/site/forms.tsx";

const title = "Contact · ARL";
const description =
  "Contact the ARL team about partnerships, press, listings or general questions.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/contact" },
  openGraph: { title, description, url: "/contact", images: [OG_IMAGE] },
};

const link = "text-accent underline underline-offset-4";

export default function ContactPage() {
  return (
    <PageShell
      current="contact"
      eyebrow="Contact"
      title="Contact the team"
      lead="Questions about ARL, partnerships, press or listings. Messages are read by the team and answered by email."
    >
      <FactList
        title="Before you write"
        items={[
          <>
            Security vulnerabilities: report them privately by email to{" "}
            <a href={`mailto:${SITE.email}?subject=Security`} className={link}>
              {SITE.email}
            </a>{" "}
            with &ldquo;Security&rdquo; in the subject, not through this form. See the{" "}
            <Link href={repoDoc("SECURITY.md")} prefetch={false} className={link}>
              security policy
            </Link>
            .
          </>,
          <>
            Email:{" "}
            <a href={`mailto:${SITE.email}`} className={link}>
              {SITE.email}
            </a>
          </>,
          "The team will never ask for your private key, seed phrase or a payment, and does not offer token sales or presales.",
          "ARL has no exchange listing announced. Anyone claiming a listing does not speak for ARL.",
        ]}
      />
      <ContactForm />
    </PageShell>
  );
}
