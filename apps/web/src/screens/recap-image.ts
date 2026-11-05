import { TITLE_INFO, type Recap } from "@karaoke-tube/shared";
import { avatarUri, detectLang, makeT, songParts, titleName, type TFn } from "@karaoke-tube/ui";
import { singerCount } from "./recap";

const W = 1080;
const FONT = '"Figtree", system-ui, -apple-system, "Segoe UI", sans-serif';

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** Draws the recap as a share-sized picture (1080 wide) and returns it as a PNG blob. */
export async function recapImage(recap: Recap, t: TFn = makeT(recap.language ?? detectLang())): Promise<Blob | null> {
  const people = recap.members.filter((m) => (recap.titles[m.id]?.length ?? 0) > 0).slice(0, 8);
  const rowH = 120;
  const moment = recap.topMoment && recap.topMoment.cheers > 0 ? recap.topMoment : null;
  const H = 520 + (moment ? 230 : 0) + people.length * rowH + 150;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext("2d");
  if (!g) return null;

  const bg = g.createLinearGradient(0, 0, W * 0.4, H);
  bg.addColorStop(0, "#7a1d52");
  bg.addColorStop(0.35, "#1b0a1a");
  bg.addColorStop(1, "#070609");
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);

  g.textBaseline = "alphabetic";
  g.fillStyle = "#ff4f8b";
  g.font = `800 34px ${FONT}`;
  g.fillText(t("recap.kicker").toUpperCase(), 72, 130);
  g.fillStyle = "#fff";
  g.font = `800 112px ${FONT}`;
  g.fillText(t("recap.title"), 72, 250);
  g.fillStyle = "#b0a8b8";
  g.font = `700 38px ${FONT}`;
  const songs = recap.performances.length;
  g.fillText(
    `${songs} ${t("unit.song", { count: songs })} · ${singerCount(recap)} ${t("unit.singer", { count: singerCount(recap) })} · ${recap.members.length} ${t("recap.atParty")}`,
    72,
    320,
  );

  let y = 400;
  if (moment) {
    g.fillStyle = "rgba(255,255,255,0.1)";
    g.beginPath();
    g.roundRect(72, y, W - 144, 180, 32);
    g.fill();
    g.fillStyle = "#ff4f8b";
    g.font = `800 28px ${FONT}`;
    g.fillText(t("recap.moment").toUpperCase(), 112, y + 56);
    g.fillStyle = "#fff";
    g.font = `800 48px ${FONT}`;
    const { title } = songParts(moment.item.song);
    g.fillText(title.length > 28 ? `${title.slice(0, 27)}…` : title, 112, y + 114);
    g.fillStyle = "#b0a8b8";
    g.font = `700 32px ${FONT}`;
    g.fillText(`🙌 ${t("recap.cheersCount", { count: moment.cheers })}`, 112, y + 158);
    y += 230;
  }

  const avatars = await Promise.all(people.map((m) => loadImage(avatarUri(m.avatarSeed))));
  people.forEach((m, i) => {
    const top = y + i * rowH;
    g.save();
    g.beginPath();
    g.arc(72 + 44, top + 50, 44, 0, Math.PI * 2);
    g.clip();
    g.fillStyle = "#221d27";
    g.fillRect(72, top + 6, 88, 88);
    const img = avatars[i];
    if (img) g.drawImage(img, 72, top + 6, 88, 88);
    g.restore();
    g.fillStyle = "#fff";
    g.font = `800 42px ${FONT}`;
    g.fillText(m.nickname.slice(0, 18), 188, top + 46);
    g.fillStyle = "#b0a8b8";
    g.font = `700 30px ${FONT}`;
    g.fillText(
      (recap.titles[m.id] ?? [])
        .map((id) => `${TITLE_INFO[id].emoji} ${titleName(t, id)}`)
        .join("   ")
        .slice(0, 60),
      188,
      top + 90,
    );
  });

  g.fillStyle = "#7d7586";
  g.font = `700 30px ${FONT}`;
  g.fillText("Karaoke Tube", 72, H - 64);

  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

/** Downloads the recap picture (or opens the share sheet with it where files can be shared). */
export async function saveRecapImage(recap: Recap, t: TFn = makeT(recap.language ?? detectLang())): Promise<void> {
  const blob = await recapImage(recap, t);
  if (!blob) return;
  const file = new File([blob], "karaoke-night.png", { type: "image/png" });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: t("share.title") });
      return;
    } catch (e) {
      if ((e as DOMException).name === "AbortError") return;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "karaoke-night.png";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
