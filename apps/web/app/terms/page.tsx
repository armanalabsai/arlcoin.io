import type { Metadata } from "next";
import Link from "next/link";

import { OG_IMAGE, SITE } from "@/content/site.ts";
import { PageShell } from "@/site/PageShell.tsx";

const title = "Terms of use · ARL";
const description = "The terms for using arlcoin.io and its whitelist and contact forms.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/terms" },
  openGraph: { title, description, url: "/terms", images: [OG_IMAGE] },
};

const link = "text-accent underline underline-offset-4";

function Section({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-[19px] font-extrabold">{heading}</h2>
      <div className="flex flex-col gap-3 text-[15px] leading-[1.7] text-fg-muted">{children}</div>
    </section>
  );
}

export default function TermsPage() {
  return (
    <PageShell
      eyebrow="Last updated 28 September 2026"
      title="Terms of use"
      lead="These terms apply to arlcoin.io and the forms on it. By using the site you accept them."
    >
      <Section heading="What this site is">
        <p>
          The site describes ARL Protocol, which is in development. The ARL token contracts are
          written and tested but have not been deployed to any public network. There is no token
          sale on this site.
        </p>
      </Section>

      <Section heading="No offer and no advice">
        <p>
          Nothing on the site is an offer to sell, or a request to buy, any token or other asset.
          Nothing on it is investment, financial, legal or tax advice. Figures such as the token
          supply and allocations describe the current plan; the plan can change, and each part of
          the site states its own status.
        </p>
      </Section>

      <Section heading="The whitelist">
        <p>
          Registering a wallet address records your interest in the launch. It does not reserve
          tokens, promise an allocation or make you eligible for anything, and it creates no
          obligation for you or for the project. Any launch will be announced with its own terms.
          How the registration data is handled is set out in the{" "}
          <Link href="/privacy" prefetch={false} className={link}>
            privacy notice
          </Link>
          .
        </p>
      </Section>

      <Section heading="Accuracy">
        <p>
          The team keeps the content current and marks what is planned, in development or complete.
          It can still be incomplete or out of date. For the code itself, the{" "}
          <Link href="/docs" prefetch={false} className={link}>
            published documents
          </Link>{" "}
          and the source code are the reference.
        </p>
      </Section>

      <Section heading="Source code and name">
        <p>
          The source code is published under the licenses stated in the repository. Those licenses
          cover the code; they do not allow using the ARL name or logo in a way that suggests the
          project endorses you or your product.
        </p>
      </Section>

      <Section heading="Other sites">
        <p>
          Links to other sites, such as the form delivery service, are provided for convenience.
          Those sites have their own terms, and the project is not responsible for them.
        </p>
      </Section>

      <Section heading="Security reports">
        <p>
          Report vulnerabilities privately, as described in the{" "}
          <Link href="/docs/security" prefetch={false} className={link}>
            security policy
          </Link>
          .
        </p>
      </Section>

      <Section heading="Liability">
        <p>
          The site is provided as it is, without warranties. To the extent the law allows, the
          project is not liable for losses that come from using the site or relying on its content.
        </p>
      </Section>

      <Section heading="Changes and contact">
        <p>
          These terms can change; the date above shows the latest version. Questions go to{" "}
          <a href={`mailto:${SITE.email}`} className={link}>
            {SITE.email}
          </a>{" "}
          or through the{" "}
          <Link href="/contact" prefetch={false} className={link}>
            contact form
          </Link>
          .
        </p>
      </Section>
    </PageShell>
  );
}
