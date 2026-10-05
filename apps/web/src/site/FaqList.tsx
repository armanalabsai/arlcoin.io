import { FAQ } from "@/content/faq.ts";

/** The questions as disclosure rows: native <details>, so they work without JavaScript. */
export function FaqList({ limit }: { limit?: number }) {
  const items = limit ? FAQ.slice(0, limit) : FAQ;
  return (
    <div className="border-t border-line text-left">
      {items.map((f, i) => (
        <details key={f.question} className="faq-item border-b border-line" open={i === 0}>
          <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-6 py-4 text-[19px] font-semibold tracking-[-0.015em] text-heading">
            {f.question}
            <span aria-hidden="true" className="faq-mark text-[24px] font-light text-accent">
              +
            </span>
          </summary>
          <p className="max-w-[64ch] pb-6 text-[17px] leading-[1.55] text-fg-muted">{f.answer}</p>
        </details>
      ))}
    </div>
  );
}
