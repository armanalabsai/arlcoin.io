import type { Metadata } from "next";
import Link from "next/link";

import { FORMS } from "@/content/forms.ts";
import { OG_IMAGE, SITE } from "@/content/site.ts";
import { PageShell } from "@/site/PageShell.tsx";

const title = "Privacy · ARL";
const description = "What arlcoin.io collects through its forms, why, and how to have it deleted.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/privacy" },
  openGraph: { title, description, url: "/privacy", images: [OG_IMAGE] },
};

const link = "text-accent underline-offset-4 hover:underline";

function Section({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-[19px] font-medium tracking-[-0.01em]">{heading}</h2>
      <div className="flex flex-col gap-3 text-[15px] leading-[1.7] text-fg-muted">{children}</div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <PageShell
      eyebrow="Privacy notice"
      title="Privacy"
      lead="This site collects personal data only when you submit a form. This notice explains what, why and for how long."
    >
      <Section heading="What is collected">
        <p>
          <strong className="font-medium text-fg">Whitelist:</strong> your wallet address and email
          address.
        </p>
        <p>
          <strong className="font-medium text-fg">Contact:</strong> your email address, the topic,
          your message and, if you give it, your name.
        </p>
        <p>
          The site sets no cookies and runs no analytics or advertising trackers. The hosting
          provider records standard server logs, such as IP addresses, to operate and protect the
          site.
        </p>
      </Section>

      <Section heading="Why">
        <p>
          Whitelist data is used to prepare the launch claim list and to send launch updates.
          Contact data is used to answer your message. Neither is sold, rented or used for
          advertising.
        </p>
      </Section>

      <Section heading="How it is processed">
        <p>
          Form submissions are delivered by email to the team&rsquo;s inbox, {SITE.email}, through
          Web3Forms, a form delivery service. Its handling of the data is described in the{" "}
          <a href={FORMS.privacyPolicy} rel="noopener noreferrer" className={link}>
            Web3Forms privacy policy
          </a>
          .
        </p>
        <p>
          A wallet address is public on the blockchain by nature. It is linked to your email only in
          the team&rsquo;s records, and that link is not published.
        </p>
      </Section>

      <Section heading="How long it is kept">
        <p>
          Whitelist data is kept until the launch claim list is final and launch updates end.
          Contact messages are kept for as long as the conversation needs. After that the data is
          deleted.
        </p>
      </Section>

      <Section heading="Your choices">
        <p>
          You can ask to see, correct or delete your data at any time through the{" "}
          <Link href="/contact" prefetch={false} className={link}>
            contact form
          </Link>{" "}
          or by email to{" "}
          <a href={`mailto:${SITE.email}`} className={link}>
            {SITE.email}
          </a>
          , using the email address you registered with. Deleting whitelist data removes the address
          from consideration for the launch list.
        </p>
      </Section>
    </PageShell>
  );
}
