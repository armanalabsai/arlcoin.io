import { SiteFooter, SiteHeader } from "./SiteFrame.tsx";

interface Props {
  current?: "whitelist" | "contact" | "faq";
  eyebrow: string;
  title: string;
  lead: string;
  /** A wider column, for long documents with tables and code. */
  wide?: boolean;
  children: React.ReactNode;
}

/** Frame for the pages outside the Core: header, a readable column and the footer. */
export function PageShell({ current, eyebrow, title, lead, wide = false, children }: Props) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader current={current} />

      <main id="content" className="flex-1 px-4 pt-14 pb-20 sm:px-8">
        <div className={`mx-auto flex flex-col gap-10 ${wide ? "max-w-[860px]" : "max-w-[680px]"}`}>
          <div className="flex flex-col gap-4">
            <p className="text-[15px] font-semibold text-accent">{eyebrow}</p>
            <h1 className="text-[40px] leading-[1.1] font-bold [overflow-wrap:anywhere] sm:text-[48px]">
              {title}
            </h1>
            <p className="text-[19px] leading-[1.5] text-fg-muted">{lead}</p>
          </div>
          {children}
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}

/** A bordered list of short facts shown before a form. */
export function FactList({ title, items }: { title: string; items: readonly React.ReactNode[] }) {
  return (
    <section className="flex flex-col gap-4 rounded-(--radius-card) border border-line bg-surface-1 p-6">
      <h2 className="text-[15px] font-extrabold">{title}</h2>
      <ul className="flex list-disc flex-col gap-2 pl-5 text-[14px] leading-[1.6] text-fg-muted marker:text-fg-subtle">
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </section>
  );
}
