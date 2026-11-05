import { formatRoomCode } from "@karaoke-tube/shared";
import { ExternalLink, Power, Tv, Users } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { AvatarPicker, Button, LanguageSwitcher, Logo, Spinner, TextField, randomSeed, useLang, useT } from "@karaoke-tube/ui";
import { createPartyApi, reopenTv, type PartyApi, type PartyInfo } from "./party";
import css from "./popup.module.css";

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

/** Toolbar popup: start a party, or see the running one. */
export function App() {
  const t = useT();
  const [lang] = useLang();
  const [api, setApi] = useState<PartyApi | null>(null);
  const [party, setParty] = useState<PartyInfo | null | undefined>(undefined);

  // The content script (TV overlay on YouTube) reads the language from extension storage.
  useEffect(() => {
    try {
      void browser.storage.local.set({ "kt:lang": lang });
    } catch {
      // not running as an extension (dev preview)
    }
  }, [lang]);

  useEffect(() => {
    let alive = true;
    createPartyApi().then(async (a) => {
      const p = await a.get();
      if (!alive) return;
      setApi(a);
      setParty(p);
    });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <main className={css.popup}>
      <header className={css.head}>
        <Logo size={24} />
        {api?.demo && <span className={css.demo}>{t("popup.demo")}</span>}
        <LanguageSwitcher />
      </header>
      {!api || party === undefined ? (
        <div className={css.loading}>
          <Spinner size={24} />
        </div>
      ) : party ? (
        <Running api={api} party={party} onEnded={() => setParty(null)} />
      ) : (
        <Start api={api} onStarted={(code) => setParty({ code, guestCount: 0 })} />
      )}
    </main>
  );
}

function Start({ api, onStarted }: { api: PartyApi; onStarted: (code: string) => void }) {
  const t = useT();
  const [lang] = useLang();
  const initial = loadIdentity();
  const [nickname, setNickname] = useState(initial.nickname);
  const [seed, setSeed] = useState(initial.avatarSeed);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const name = nickname.trim();
    if (!name) return;
    setBusy(true);
    setError(null);
    try {
      localStorage.setItem(ID_KEY, JSON.stringify({ nickname: name, avatarSeed: seed }));
    } catch {
      // ignore
    }
    const r = await api.start(name, seed, lang);
    setBusy(false);
    if (r.ok) onStarted(r.code);
    else setError(t("popup.startError"));
  };

  return (
    <form className={css.body} onSubmit={submit}>
      <h1 className={css.title}>{t("popup.title")}</h1>
      <p className={css.lead}>{t("popup.lead")}</p>
      <AvatarPicker value={seed} onChange={setSeed} previewSize={72} compact />
      <TextField
        label={t("newparty.name")}
        value={nickname}
        onChange={(e) => setNickname(e.target.value.slice(0, 20))}
        placeholder={t("newparty.namePlaceholder")}
        autoFocus
        className={css.name}
      />
      {error && (
        <p className={css.error} role="alert">
          {error}
        </p>
      )}
      <Button type="submit" block disabled={busy || !nickname.trim()}>
        {busy ? t("newparty.starting") : t("popup.start")}
      </Button>
    </form>
  );
}

function Running({ api, party, onEnded }: { api: PartyApi; party: PartyInfo; onEnded: () => void }) {
  const t = useT();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <div className={css.body}>
      <section className={css.card}>
        <span className={css.live}>
          <span className={css.dot} /> {t("popup.running")}
        </span>
        <span className={css.code}>{formatRoomCode(party.code)}</span>
        <span className={css.guests}>
          <Users size={14} /> {t("popup.guests", { count: party.guestCount })}
        </span>
      </section>
      <Button variant="light" block icon={<ExternalLink size={16} />} onClick={() => api.openHost()}>
        {t("popup.openHost")}
      </Button>
      {party.tvOpen === false && (
        <Button variant="secondary" block icon={<Tv size={16} />} onClick={() => void reopenTv()}>
          {t("popup.reopenTv")}
        </Button>
      )}
      {confirm ? (
        <div className={css.confirm}>
          <span>{t("popup.endAsk")}</span>
          <div className={css.confirmButtons}>
            <Button size="sm" variant="secondary" onClick={() => setConfirm(false)}>
              {t("popup.cancel")}
            </Button>
            <Button
              size="sm"
              variant="danger"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                await api.end();
                onEnded();
              }}
            >
              {t("popup.endShort")}
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="ghost" block icon={<Power size={16} />} onClick={() => setConfirm(true)}>
          {t("host.endLabel")}
        </Button>
      )}
    </div>
  );
}
