import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { AccountApiError } from "@karaoke-tube/client";
import {
  DEFAULT_SETTINGS,
  TITLE_INFO,
  type Friend,
  type FavoriteSong,
  type PartyLogEntry,
  type QueueMode,
  type RoomSettings,
} from "@karaoke-tube/shared";
import { Avatar, AvatarPicker, Button, Chip, EmptyState, LanguageSwitcher, Logo, SongArt, Spinner, TextField, Toggle, useT, type TKey } from "@karaoke-tube/ui";
import { useAccount } from "./AccountContext";
import { useLiveParties } from "./useLiveParties";
import { adoptLiveParty } from "../session";
import css from "./account.module.css";

type Tab = "profile" | "favorites" | "friends" | "parties";

/** /account: sign in or create an account (both optional), then profile, favorites, friends and the party log. */
export function AccountPage() {
  const { account, loading } = useAccount();
  const t = useT();
  return (
    <div className={css.page}>
      <header className={css.top}>
        <Link to="/join" aria-label="Home">
          <Logo size={32} />
        </Link>
        <LanguageSwitcher />
      </header>
      <div className={css.body}>
        <h1 className={css.title}>{t("acct.title")}</h1>
        {loading ? <Spinner /> : account ? <Signed /> : <AuthForm />}
      </div>
    </div>
  );
}

function useErrorText() {
  const t = useT();
  return (e: unknown) => (e instanceof AccountApiError && e.code !== "network" ? e.message : t("acct.error.network"));
}

function AuthForm() {
  const { signIn, register } = useAccount();
  const t = useT();
  const errText = useErrorText();
  const nav = useNavigate();
  const [mode, setMode] = useState<"in" | "new">("in");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (mode === "in") await signIn(username, password);
      else await register({ username, password, displayName: name.trim() || undefined });
    } catch (err) {
      setError(errText(err));
      setBusy(false);
    }
  };

  return (
    <form className={css.card} onSubmit={submit} noValidate>
      <p className={css.lead}>{t("acct.optional")}</p>
      <div className={css.tabs}>
        <Chip selected={mode === "in"} onClick={() => setMode("in")}>
          {t("acct.signIn")}
        </Chip>
        <Chip selected={mode === "new"} onClick={() => setMode("new")}>
          {t("acct.create")}
        </Chip>
      </div>
      <TextField
        label={t("acct.username")}
        value={username}
        onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 20))}
        autoCapitalize="none"
        autoComplete="username"
        spellCheck={false}
      />
      {mode === "new" && (
        <TextField label={t("acct.displayName")} value={name} onChange={(e) => setName(e.target.value.slice(0, 20))} autoComplete="nickname" />
      )}
      <TextField
        label={t("acct.password")}
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete={mode === "in" ? "current-password" : "new-password"}
        placeholder={mode === "new" ? t("acct.passwordHint") : undefined}
      />
      {error && (
        <p className={css.error} role="alert">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" block disabled={busy || username.length < 3 || !password}>
        {busy ? t("acct.working") : mode === "in" ? t("acct.signIn") : t("acct.create")}
      </Button>
      <Button type="button" variant="ghost" block onClick={() => nav("/join")}>
        {t("acct.guest")}
      </Button>
    </form>
  );
}

function Signed() {
  const { account, stats, signOut } = useAccount();
  const t = useT();
  const [tab, setTab] = useState<Tab>("profile");
  if (!account) return null;
  const tabs: Tab[] = ["profile", "favorites", "friends", "parties"];
  return (
    <>
      <div className={css.hero}>
        <Avatar seed={account.avatarSeed} size={88} name={account.displayName} />
        <div className={css.name}>{account.displayName}</div>
        <div className={css.sub}>
          @{account.username}
          {account.tagline ? ` · ${account.tagline}` : ""}
        </div>
      </div>
      {stats && (
        <div className={css.stats}>
          {(
            [
              ["parties", stats.parties],
              ["hosted", stats.hosted],
              ["songs", stats.songsSung],
              ["cheers", stats.cheers],
              ["favorites", stats.favorites],
              ["friends", stats.friends],
            ] as const
          ).map(([k, n]) => (
            <div key={k} className={css.stat}>
              <b>{n}</b>
              <span>{t(`acct.stat.${k}` as TKey)}</span>
            </div>
          ))}
        </div>
      )}
      <div className={css.tabs} role="tablist">
        {tabs.map((id) => (
          <Chip key={id} selected={tab === id} role="tab" onClick={() => setTab(id)}>
            {t(`acct.tab.${id}` as TKey)}
          </Chip>
        ))}
      </div>
      {tab === "profile" && <Profile />}
      {tab === "favorites" && <Favorites />}
      {tab === "friends" && <Friends />}
      {tab === "parties" && <Parties />}
      <Button variant="secondary" block onClick={() => void signOut()}>
        {t("acct.signOut")}
      </Button>
    </>
  );
}

const BOOLS: Array<[keyof RoomSettings, TKey]> = [
  ["hostsOnlyAdd", "settings.hostsOnly"],
  ["reactions", "settings.reactions"],
  ["getReadyCard", "settings.getReady"],
  ["duets", "settings.duets"],
  ["turnAlerts", "settings.turnAlerts"],
  ["awards", "settings.awards"],
  ["titles", "settings.titles"],
];
const MODES: Array<[QueueMode, TKey]> = [
  ["rotation", "settings.rotation"],
  ["fifo", "settings.fifo"],
  ["approval", "settings.approval"],
];

function Profile() {
  const { api, account, setMe } = useAccount();
  const t = useT();
  const errText = useErrorText();
  const [name, setName] = useState(account!.displayName);
  const [seed, setSeed] = useState(account!.avatarSeed);
  const [tagline, setTagline] = useState(account!.tagline);
  const [settings, setSettings] = useState<RoomSettings>({ ...DEFAULT_SETTINGS, ...(account!.roomSettings ?? {}) });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const save = async () => {
    setMsg(null);
    const { locked: _locked, ...rest } = settings; // locking a room is per-party, not a default
    void _locked;
    try {
      setMe(await api.updateProfile({ displayName: name.trim(), avatarSeed: seed, tagline: tagline.trim(), roomSettings: rest }));
      setMsg({ ok: true, text: t("acct.saved") });
    } catch (e) {
      setMsg({ ok: false, text: errText(e) });
    }
  };

  return (
    <>
      <section className={css.card}>
        <AvatarPicker value={seed} onChange={setSeed} />
        <TextField label={t("acct.displayName")} value={name} onChange={(e) => setName(e.target.value.slice(0, 20))} />
        <TextField
          label={t("acct.tagline")}
          value={tagline}
          placeholder={t("acct.taglinePlaceholder")}
          onChange={(e) => setTagline(e.target.value.slice(0, 80))}
        />
      </section>
      <section className={css.card}>
        <div>
          <div className={css.name}>{t("acct.roomSettings")}</div>
          <div className={css.sub}>{t("acct.roomSettingsHint")}</div>
        </div>
        <div className={css.tabs}>
          {MODES.map(([mode, key]) => (
            <Chip key={mode} selected={settings.queueMode === mode} onClick={() => setSettings({ ...settings, queueMode: mode })}>
              {t(key)}
            </Chip>
          ))}
        </div>
        <div className={css.settingList}>
          {BOOLS.map(([k, key]) => (
            <Toggle key={k} label={t(key)} checked={settings[k] as boolean} onChange={(v) => setSettings({ ...settings, [k]: v })} />
          ))}
        </div>
        <Button variant="ghost" onClick={() => setSettings({ ...DEFAULT_SETTINGS })}>
          {t("acct.useCurrent")}
        </Button>
      </section>
      {msg && <p className={msg.ok ? css.ok : css.error}>{msg.text}</p>}
      <Button block size="lg" onClick={save} disabled={!name.trim()}>
        {t("acct.save")}
      </Button>
      <Security />
    </>
  );
}

function Security() {
  const { api, signOut } = useAccount();
  const t = useT();
  const errText = useErrorText();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [del, setDel] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = async (fn: () => Promise<void>, ok?: string) => {
    setMsg(null);
    try {
      await fn();
      if (ok) setMsg({ ok: true, text: ok });
    } catch (e) {
      setMsg({ ok: false, text: errText(e) });
    }
  };
  return (
    <section className={css.card}>
      <TextField label={t("acct.password.current")} type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
      <TextField label={t("acct.password.new")} type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" placeholder={t("acct.passwordHint")} />
      <Button
        variant="secondary"
        disabled={!current || next.length < 8}
        onClick={() =>
          run(async () => {
            await api.changePassword(current, next);
            setCurrent("");
            setNext("");
          }, t("acct.password.done"))
        }
      >
        {t("acct.password.change")}
      </Button>
      <p className={css.muted}>{t("acct.deleteConfirm")}</p>
      <TextField label={t("acct.password")} type="password" value={del} onChange={(e) => setDel(e.target.value)} autoComplete="current-password" />
      <Button
        variant="danger"
        disabled={!del}
        onClick={() =>
          run(async () => {
            await api.deleteAccount(del);
            await signOut();
          })
        }
      >
        {t("acct.delete")}
      </Button>
      {msg && <p className={msg.ok ? css.ok : css.error}>{msg.text}</p>}
    </section>
  );
}

function Favorites() {
  const { api, refresh } = useAccount();
  const t = useT();
  const [items, setItems] = useState<FavoriteSong[] | null>(null);
  useEffect(() => {
    api
      .favorites()
      .then((r) => setItems(r.favorites))
      .catch(() => setItems([]));
  }, [api]);
  if (!items) return <Spinner />;
  if (!items.length) return <EmptyState title={t("acct.tab.favorites")}>{t("acct.favorites.empty")}</EmptyState>;
  return (
    <section className={css.card}>
      {items.map(({ song }) => (
        <div key={song.videoId} className={css.row}>
          <SongArt song={song} size={48} explicit={song.explicit} />
          <div className={css.grow}>
            <div className={css.name}>{song.title}</div>
            <div className={css.sub}>{song.channel}</div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              await api.removeFavorite(song.videoId).catch(() => {});
              setItems((l) => l?.filter((f) => f.song.videoId !== song.videoId) ?? l);
              void refresh();
            }}
          >
            {t("acct.favorites.remove")}
          </Button>
        </div>
      ))}
    </section>
  );
}

function Friends() {
  const { api, account, refresh } = useAccount();
  const t = useT();
  const errText = useErrorText();
  const [friends, setFriends] = useState<Friend[] | null>(null);
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api
      .friends()
      .then((r) => setFriends(r.friends))
      .catch(() => setFriends([]));
  }, [api]);
  const apply = async (p: Promise<{ friends: Friend[] }>) => {
    setError(null);
    try {
      setFriends((await p).friends);
      void refresh();
    } catch (e) {
      setError(errText(e));
    }
  };
  if (!friends) return <Spinner />;
  const group = (s: Friend["status"]) => friends.filter((f) => f.status === s);
  const person = (f: Friend, actions: React.ReactNode) => (
    <div key={f.profile.id} className={css.row}>
      <Avatar seed={f.profile.avatarSeed} size={44} name={f.profile.displayName} />
      <div className={css.grow}>
        <div className={css.name}>{f.profile.displayName}</div>
        <div className={css.sub}>
          @{f.profile.username}
          {f.profile.tagline ? ` · ${f.profile.tagline}` : ""}
        </div>
      </div>
      <div className={css.actions}>{actions}</div>
    </div>
  );
  return (
    <>
      <form
        className={css.card}
        onSubmit={(e) => {
          e.preventDefault();
          const name = username.trim();
          if (!name) return;
          setUsername("");
          void apply(api.addFriend(name));
        }}
      >
        <TextField label={t("acct.friends.add")} value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())} placeholder="@" autoCapitalize="none" spellCheck={false} />
        <Button type="submit" disabled={!username.trim()}>
          {t("acct.friends.send")}
        </Button>
        {error && (
          <p className={css.error} role="alert">
            {error}
          </p>
        )}
      </form>
      {group("incoming").length > 0 && (
        <section className={css.card}>
          <div className={css.section}>{t("acct.friends.requests")}</div>
          {group("incoming").map((f) =>
            person(
              f,
              <>
                <Button size="sm" onClick={() => apply(api.acceptFriend(f.profile.id))}>
                  {t("acct.friends.accept")}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => apply(api.removeFriend(f.profile.id))}>
                  {t("acct.friends.decline")}
                </Button>
              </>,
            ),
          )}
        </section>
      )}
      {group("friend").length > 0 ? (
        <section className={css.card}>
          <div className={css.section}>{t("acct.friends.list")}</div>
          {group("friend").map((f) =>
            person(
              f,
              <Button size="sm" variant="ghost" onClick={() => apply(api.removeFriend(f.profile.id))}>
                {t("acct.friends.remove")}
              </Button>,
            ),
          )}
        </section>
      ) : (
        group("incoming").length === 0 &&
        group("outgoing").length === 0 && <p className={css.muted}>{t("acct.friends.empty", { name: account?.username ?? "" })}</p>
      )}
      {group("outgoing").length > 0 && (
        <section className={css.card}>
          <div className={css.section}>{t("acct.friends.sent")}</div>
          {group("outgoing").map((f) =>
            person(
              f,
              <Button size="sm" variant="ghost" onClick={() => apply(api.removeFriend(f.profile.id))}>
                {t("acct.friends.cancel")}
              </Button>,
            ),
          )}
        </section>
      )}
    </>
  );
}

function Parties() {
  const { api } = useAccount();
  const t = useT();
  const navigate = useNavigate();
  const live = useLiveParties();
  const [items, setItems] = useState<PartyLogEntry[] | null>(null);
  useEffect(() => {
    api
      .parties()
      .then((r) => setItems(r.parties))
      .catch(() => setItems([]));
  }, [api]);
  if (!items) return <Spinner />;
  if (!items.length) return <EmptyState title={t("acct.tab.parties")}>{t("acct.parties.empty")}</EmptyState>;
  return (
    <>
      {items.map((p) => (
        <section key={`${p.code}-${p.joinedAt}`} className={css.card}>
          <div className={css.row}>
            <div className={css.grow}>
              <div className={css.name}>{new Date(p.joinedAt).toLocaleDateString(undefined, { dateStyle: "medium" })}</div>
              <div className={css.sub}>
                {[
                  p.role === "host" ? t("acct.parties.hosted") : null,
                  p.endedAt === null ? t("acct.parties.live") : null,
                  t("acct.parties.songs", { count: p.songsSung }),
                  t("acct.parties.people", { count: p.members }),
                  `👏 ${p.cheers}`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            </div>
            {p.endedAt === null && live?.find((l) => l.code === p.code) && (
              <Button size="sm" onClick={() => navigate(adoptLiveParty(live.find((l) => l.code === p.code)!))}>
                {t("acct.parties.rejoin")}
              </Button>
            )}
            {p.recapId && (
              <Link to={`/recap/${p.recapId}`}>
                <Button size="sm" variant="secondary">
                  {t("acct.parties.recap")}
                </Button>
              </Link>
            )}
          </div>
          {p.topSong && <div className={css.sub}>{t("acct.parties.top", { title: p.topSong.title })}</div>}
          {p.titles.length > 0 && (
            <div className={css.titles}>
              {p.titles.map((id) => (
                <Chip key={id} disabled>
                  {TITLE_INFO[id].emoji} {TITLE_INFO[id].name}
                </Chip>
              ))}
            </div>
          )}
        </section>
      ))}
    </>
  );
}
