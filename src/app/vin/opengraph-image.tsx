import { ImageResponse } from "next/og";
import { readFile } from "fs/promises";
import { join } from "path";

export const alt = "Vin Sixsmith — AI safety, unpacked";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  const avatarBuffer = await readFile(join(process.cwd(), "public", "vin", "avatar.jpg"));
  const avatarData = `data:image/jpeg;base64,${avatarBuffer.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 36,
          background: "#FAF8F5",
          backgroundImage:
            "radial-gradient(ellipse 60% 55% at 50% 40%, rgba(13,147,115,0.08) 0%, transparent 75%)",
          fontFamily: "system-ui, -apple-system, sans-serif",
          padding: 80,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={avatarData}
          alt="Vin Sixsmith"
          width={200}
          height={200}
          style={{
            borderRadius: 9999,
            boxShadow: "0 10px 40px rgba(13,147,115,0.18)",
          }}
        />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div
            style={{
              fontSize: 72,
              fontWeight: 700,
              letterSpacing: "-0.03em",
              color: "#1A1A2E",
            }}
          >
            Vin Sixsmith
          </div>
          <div
            style={{
              marginTop: 16,
              fontSize: 32,
              color: "#4A4A5E",
            }}
          >
            AI safety, unpacked.
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
