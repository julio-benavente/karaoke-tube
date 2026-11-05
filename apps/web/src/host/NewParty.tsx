import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { localStorageCredentials } from "@karaoke-tube/client";
import { normalizeRoomCode, type CreateRoomResponse } from "@karaoke-tube/shared";
import { AvatarPicker, Button, LanguageSwitcher, Logo, TextField, randomSeed, useLang, useT } from "@karaoke-tube/ui";
import { useAccount } from "../account/AccountContext";
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
  const [lang] = useLang();
  const { account, api } = useAccount();
  const [initial] = useState(() => (account ? { nickname: account.displayName, avatarSeed: account.avatarSeed } : loadIdentity()));
  const [nickname, setNickname] = useState(initial.nickname);
  const [seed, setSeed] = useState(initial.avatarSeed);

  // The saved token is checked asynchronously, so the account can arrive after the first render:
  // fill in its name and avatar then, unless the person already started changing them.
  useEffect(() => {
    if (!account) return;
    if (nickname === initial.nickname && seed === initial.avatarSeed) {
      setNickname(account.displayName);
      setSeed(account.avatarSeed);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account?.id]);
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
        // A signed-in host also sends the token so the room starts with their saved settings (guests send nothing).
        headers: { "content-type": "application/json", ...(api.token() ? { Authorization: `Bearer ${api.token()}` } : {}) },
        body: JSON.stringify({ nickname: name, avatarSeed: seed, language: lang }),
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
      </header>
      <form className={css.card} onSubmit={submit} noValidate>
        <h1 className={css.title}>{t("newparty.title")}</h1>
        <p className={css.lead}>{t("newparty.lead")}</p>
        <AvatarPicker value={seed} onChange={setSeed} />
        <div>
          <p className={css.lead}>{t("newparty.language")}</p>
          <LanguageSwitcher />
          <p className={css.hint}>{t("newparty.languageHint")}</p>
        </div>
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
