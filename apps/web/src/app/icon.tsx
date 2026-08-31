import { ImageResponse } from "next/og";

export const size = {
  width: 64,
  height: 64,
};

export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        alignItems: "center",
        background: "#0d4635",
        borderRadius: "16px",
        display: "flex",
        height: "64px",
        justifyContent: "center",
        width: "64px",
      }}
    >
      <div style={{ alignItems: "center", display: "flex", gap: "4px", height: "38px" }}>
        {[14, 24, 38, 24, 14].map((height, index) => (
          <div
            key={height + index}
            style={{
              background: index === 2 ? "#dff66b" : "#ffffff",
              borderRadius: "999px",
              height: `${height}px`,
              width: "5px",
            }}
          />
        ))}
      </div>
    </div>,
    size,
  );
}
