import { ImageResponse } from "next/og";
import { readFile } from "fs/promises";
import { join } from "path";

export const alt = "Josh Thor — Learn more about risks from AI and take action";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  const avatarBuffer = await readFile(
    join(process.cwd(), "public", "josh", "avatar.jpg")
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
          alignItems: "center",
          justifyContent: "center",
          gap: 32,
          background: "#ffeee1",
          fontFamily: "system-ui, -apple-system, sans-serif",
          padding: 80,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={avatarData}
          alt="Josh Thor"
          width={200}
          height={200}
          style={{
            borderRadius: 9999,
            border: "4px solid #ccbeb4",
            boxShadow: "0 10px 40px rgba(204,190,180,0.45)",
          }}
        />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <div
            style={{
              fontSize: 60,
              fontWeight: 700,
              letterSpacing: "-0.02em",
              color: "#2a2520",
            }}
          >
            @joshthor_
          </div>
          <div
            style={{
              marginTop: 18,
              fontSize: 30,
              color: "#5a4f47",
              textAlign: "center",
              maxWidth: 900,
            }}
          >
            Learn more about risks from AI and take action.
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
