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

const link = "text-accent underline underline-offset-4";

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
      lead="This site collects personal data only when you submit a form. This notice explains who is responsible for it, what is collected, why, for how long and what your rights are. It is the information notice required by the Turkish Personal Data Protection Law No. 6698 (KVKK)."
    >
      <Section heading="Data controller">
        <p>
          {SITE.controller.name}, trading as {SITE.controller.business}, {SITE.controller.address}.
          Contact:{" "}
          <a href={`mailto:${SITE.email}`} className={link}>
            {SITE.email}
          </a>
          .
        </p>
      </Section>

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

      <Section heading="Why, and on what legal basis">
        <p>
          Whitelist data is used to prepare the launch claim list and to send launch updates.
          Contact data is used to answer your message. Neither is sold, rented or used for
          advertising.
        </p>
        <p>
          The data is collected through the forms on this site, by automated means. It is processed
          because it is necessary to take the step you ask for, registering or getting an answer,
          and for the legitimate interest of running the launch list (KVKK Article 5(2)(c) and (f)).
          Server logs are kept for the security of the site on the same legitimate interest basis.
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
          Whitelist registrations are also stored in a database run by Supabase in the European
          Union (Ireland), together with the time you gave each confirmation and the version of this
          notice you accepted. The database accepts new registrations from the site but never
          returns stored data to it; only the team can read the list.
        </p>
        <p>
          Supabase and Web3Forms are located outside Turkey. Your data is transferred to them only
          with the explicit consent you give on the whitelist form (KVKK Article 9), and a
          registration is not possible without it. The data is not shared with anyone else unless a
          court or authority requires it by law.
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

      <Section heading="Your rights">
        <p>Under KVKK Article 11 you can ask the data controller to:</p>
        <ul className="flex list-disc flex-col gap-1 pl-5">
          <li>
            tell you whether your personal data is processed, and give you information about it;
          </li>
          <li>tell you the purpose of the processing and whether the data is used for it;</li>
          <li>tell you who, in Turkey or abroad, the data is transferred to;</li>
          <li>correct data that is incomplete or wrong, and tell those it was transferred to;</li>
          <li>delete or destroy the data, and tell those it was transferred to;</li>
          <li>
            object to a result against you that comes only from automated analysis of the data;
          </li>
          <li>compensate a loss caused by unlawful processing.</li>
        </ul>
        <p>
          Requests are answered free of charge within 30 days. If you are not satisfied with the
          answer, you can complain to the Personal Data Protection Authority (KVKK).
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
