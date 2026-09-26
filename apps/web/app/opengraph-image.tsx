import { ImageResponse } from "next/og";

export const alt = "ARL · 21,000,000 ARL maximum supply";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Generated at build time from text only: no external image or font requests.
export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 80,
        background: "#0a0b0d",
        color: "#f2f3f5",
      }}
    >
      <div style={{ display: "flex", fontSize: 28, color: "#a1a7b0", letterSpacing: 4 }}>
        INTERACTIVE CORE
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div style={{ display: "flex", fontSize: 160, fontWeight: 700, letterSpacing: -8 }}>
          ARL
        </div>
        <div style={{ display: "flex", fontSize: 36, color: "#a1a7b0" }}>
          21,000,000 ARL maximum supply · Not yet deployed
        </div>
      </div>
      <div style={{ display: "flex", width: 120, height: 4, background: "#e0a94e" }} />
    </div>,
    size,
  );
}
