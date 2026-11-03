import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { localStorageCredentials } from "@karaoke-tube/client";
import { normalizeRoomCode, type CreateRoomResponse } from "@karaoke-tube/shared";
import { AvatarPicker, Button, LanguageSwitcher, Logo, TextField, randomSeed, useT } from "@karaoke-tube/ui";
import css from "../screens/Join.module.css";

const ID_KEY = "kt:identity";

function loadIdentity(): { nickname: string; avatarSeed: string } {
  try {
    const raw = localStorage.getItem(ID_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  return { nickname: "", avatarSeed: randomSeed() };
}

/** /host/new: start a party from the website. Saves the host's key and lands on the host app. */
export function NewParty() {
  const nav = useNavigate();
  const t = useT();
  const [initial] = useState(loadIdentity);
  const [nickname, setNickname] = useState(initial.nickname);
  const [seed, setSeed] = useState(initial.avatarSeed);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const name = nickname.trim();
    if (!name || busy) return;
    setBusy(true);
    setError(null);
    try {
      localStorage.setItem(ID_KEY, JSON.stringify({ nickname: name, avatarSeed: seed }));
    } catch {
      // ignore
    }
    try {
      const res = await fetch("/api/rooms", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nickname: name, avatarSeed: seed }),
      });
      if (!res.ok) throw new Error(t("newparty.errorStatus", { status: res.status }));
      const created = (await res.json()) as CreateRoomResponse;
      const code = normalizeRoomCode(created.code);
      localStorageCredentials().save(code, { memberId: created.memberId, key: created.key });
      nav(`/host/${code}`);
    } catch (err) {
      setBusy(false);
      setError(err instanceof Error ? err.message : t("newparty.error"));
    }
  };

  return (
    <div className={css.page}>
      <header className={css.top}>
        <Logo size={32} />
        <LanguageSwitcher />
      </header>
      <form className={css.card} onSubmit={submit} noValidate>
        <h1 className={css.title}>{t("newparty.title")}</h1>
        <p className={css.lead}>{t("newparty.lead")}</p>
        <AvatarPicker value={seed} onChange={setSeed} />
        <TextField
          label={t("newparty.name")}
          value={nickname}
          onChange={(e) => setNickname(e.target.value.slice(0, 20))}
          placeholder={t("newparty.namePlaceholder")}
          autoComplete="nickname"
          autoFocus
        />
        {error && (
          <p className={css.formError} role="alert">
            {error}
          </p>
        )}
        <Button type="submit" size="lg" block disabled={busy || !nickname.trim()}>
          {busy ? t("newparty.starting") : t("newparty.start")}
        </Button>
      </form>
    </div>
  );
}
