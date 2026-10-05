import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="flex flex-col items-center gap-6 text-center">
        <p className="text-[12px] text-fg-subtle">404</p>
        <h1 className="text-[32px] font-extrabold tracking-[-0.03em]">Nothing here</h1>
        <Link
          href="/"
          className="inline-flex h-12 items-center rounded-full bg-accent px-6 text-[17px] font-semibold text-page hover:bg-accent-strong"
        >
          Back to the Core
        </Link>
      </div>
    </main>
  );
}
