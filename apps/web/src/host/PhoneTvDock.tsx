import { Maximize2, Minimize2, X } from "lucide-react";
import { useState } from "react";
import { useT } from "@karaoke-tube/ui";
import css from "./host.module.css";

const KEY = "kt:phoneTv";

/** The party code this phone is the TV for, remembered so a reload brings the TV back. */
export function loadPhoneTv(code: string): boolean {
  try {
    return localStorage.getItem(KEY) === code;
  } catch {
    return false;
  }
}

export function savePhoneTv(code: string, on: boolean) {
  try {
    if (on) localStorage.setItem(KEY, code);
    else if (localStorage.getItem(KEY) === code) localStorage.removeItem(KEY);
  } catch {
    // storage unavailable
  }
}

/**
 * This phone is the TV: the TV page runs in a frame inside the host panel's own page. A TV in another tab is frozen
 * by the phone as soon as you leave it (the music stops, songs stop advancing); in here it keeps running while you
 * move around the host panel. Big while you tap Start, then shrink it to a corner.
 * The TV page does not ask for fullscreen when it is in a frame (it would cover the whole host panel).
 */
export function PhoneTvDock({ code, aboveMini, onClose }: { code: string; aboveMini: boolean; onClose: () => void }) {
  const t = useT();
  const [open, setOpen] = useState(true);
  return (
    <div
      className={`${css.phoneTv} ${open ? css.phoneTvOpen : ""} ${aboveMini ? css.phoneTvAboveMini : ""}`}
      data-testid="phone-tv"
    >
      {open && (
        <div className={css.phoneTvBar}>
          <b>{t("phonetv.title")}</b>
          <span className={css.phoneTvButtons}>
            <button type="button" onClick={() => setOpen(false)} aria-label={t("phonetv.minimize")}>
              <Minimize2 size={18} />
            </button>
            <button type="button" onClick={onClose} aria-label={t("phonetv.close")}>
              <X size={18} />
            </button>
          </span>
        </div>
      )}
      <iframe className={css.phoneTvFrame} title={t("phonetv.title")} src={`/tv/${code}`} allow="autoplay; screen-wake-lock" />
      {!open && (
        <>
          <button type="button" className={css.phoneTvHit} onClick={() => setOpen(true)} aria-label={t("phonetv.expand")}>
            <Maximize2 size={16} />
          </button>
          <button type="button" className={css.phoneTvX} onClick={onClose} aria-label={t("phonetv.close")}>
            <X size={14} />
          </button>
        </>
      )}
    </div>
  );
}
