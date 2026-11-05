import type { ReactNode } from "react";
import type { Member } from "@karaoke-tube/shared";
import { formatRoomCode } from "@karaoke-tube/shared";
import { Avatar, useT } from "@karaoke-tube/ui";
import { WEB_URL } from "../host/client";
import { useQr } from "./TvLayer";

/** The TV's lobby: big QR + code and the guests as they join. `action` (the Start button) shows before the party starts. */
export function Lobby({ code, members, action, hint }: { code: string; members: Member[]; action?: ReactNode; hint?: ReactNode }) {
  const t = useT();
  const qr = useQr(`${WEB_URL}/join/${code}`, 600);
  const guests = members.filter((m) => m.role !== "host");
  return (
    <div
      data-testid="tv-lobby"
      style={{ position: "absolute", inset: 0, zIndex: 10, background: "radial-gradient(ellipse at top, #2a0f1d 0%, #070609 70%)", color: "#fff", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "2.5vh", textAlign: "center", padding: 24 }}
    >
      <h1 style={{ fontSize: "5vh", margin: 0 }}>Karaoke Tube</h1>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", alignItems: "center", gap: "2vh 4vw" }}>
        <div style={{ background: "#fff", padding: "1.2vh", borderRadius: 16, width: "34vh", height: "34vh" }}>
          {qr && <img src={qr} alt={t("tv.qrAlt")} style={{ width: "100%", height: "100%", imageRendering: "pixelated" }} />}
        </div>
        <div style={{ textAlign: "left" }}>
          <div style={{ fontSize: "2.4vh", letterSpacing: "0.1em", textTransform: "uppercase", color: "#b0a8b8", fontWeight: 700 }}>{t("tv.scan", { url: `${new URL(WEB_URL).host}/join` })}</div>
          <div data-testid="tv-lobby-code" style={{ fontSize: "min(9vh, 9vw)", fontWeight: 800, lineHeight: 1.1 }}>{formatRoomCode(code)}</div>
        </div>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "2vh", minHeight: "12vh", maxWidth: "80vw" }}>
        {guests.length === 0 && <span style={{ color: "#b0a8b8", fontSize: "2.6vh", alignSelf: "center" }}>{t("tv.waitingSingers")}</span>}
        {guests.map((m) => (
          <div key={m.id} data-testid="tv-lobby-guest" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, animation: "kt-pop 400ms cubic-bezier(0.3,1.6,0.5,1) both" }}>
            <Avatar seed={m.avatarSeed} size={72} />
            <span style={{ fontSize: "2.2vh", fontWeight: 700 }}>{m.nickname}</span>
          </div>
        ))}
      </div>
      {action}
      {hint}
      <style>{`@keyframes kt-pop{from{transform:scale(0.2);opacity:0}to{transform:scale(1);opacity:1}}`}</style>
    </div>
  );
}
