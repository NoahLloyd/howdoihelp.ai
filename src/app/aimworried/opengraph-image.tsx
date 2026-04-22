import { ImageResponse } from "next/og";
import { readFile } from "fs/promises";
import { join } from "path";

export const alt = "AI'M worried — by Vin Sixsmith";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  const avatarBuffer = await readFile(
    join(process.cwd(), "public", "aimworried", "avatar.jpg")
  );
  const avatarData = `data:image/jpeg;base64,${avatarBuffer.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#EFEAE0",
          fontFamily: "system-ui, -apple-system, sans-serif",
          padding: 72,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            flex: 1,
            gap: 4,
          }}
        >
          <div
            style={{
              fontSize: 220,
              fontWeight: 900,
              letterSpacing: "-0.04em",
              lineHeight: 1,
              color: "#2F3FD9",
            }}
          >
            AI&#8217;M
          </div>
          <div
            style={{
              fontSize: 220,
              fontWeight: 900,
              letterSpacing: "-0.04em",
              lineHeight: 1,
              color: "#2F3FD9",
            }}
          >
            worried
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 20,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={avatarData}
            alt="Vin Sixsmith"
            width={80}
            height={80}
            style={{ borderRadius: 9999 }}
          />
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 28, fontWeight: 600, color: "#1A1A2E" }}>
              Vin Sixsmith
            </div>
            <div style={{ fontSize: 22, color: "#4A4A5E" }}>
              AI safety, unpacked.
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
