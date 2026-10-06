import { InteractiveCore } from "@/core/InteractiveCore.tsx";

// The Core lives in this layout, so it stays mounted across every route in
// the group: moving between layers and cards never remounts it. Pages only
// contribute metadata.
export default function CoreLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <InteractiveCore />
      {children}
    </>
  );
}
