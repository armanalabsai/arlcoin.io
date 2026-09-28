import type { Metadata } from "next";

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
            Security vulnerabilities: report them privately through{" "}
            <a
              href="https://github.com/gokturkalazdaghan-dot/ARLCOIN/security/advisories/new"
              rel="noopener noreferrer"
              className={link}
            >
              GitHub private vulnerability reporting
            </a>
            . See the{" "}
            <a href={repoDoc("SECURITY.md")} rel="noopener noreferrer" className={link}>
              security policy
            </a>
            .
          </>,
          <>
            Email:{" "}
            <a href={`mailto:${SITE.email}`} className={link}>
              {SITE.email}
            </a>
          </>,
          "The team will never ask for your private key, seed phrase or a payment, and does not offer token sales or presales.",
          "ARL has no exchange listing and no partnership announced. Anyone claiming otherwise does not speak for ARL.",
        ]}
      />
      <ContactForm />
    </PageShell>
  );
}
