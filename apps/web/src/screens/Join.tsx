import { LanguageSwitcher, useT } from "@karaoke-tube/ui";
import { ROOM_CODE_EXAMPLE, isRoomCode } from "@karaoke-tube/shared";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router";
import type { ErrorCode } from "@karaoke-tube/shared";
import { AvatarPicker, Button, Logo, TextField, errorText } from "@karaoke-tube/ui";
import {
  canResume,
  dropRoomClient,
  getRoomClient,
  resumableRoom,
  getSearchApi,
  loadIdentity,
  markJoined,
  normalizeCode,
  saveIdentity,
  USE_MOCK,
} from "../session";
import { useAccount } from "../account/AccountContext";
import css from "./Join.module.css";

/** G1: code, avatar with re-roll, nickname, Join. Already a member (closed the tab, came back)? Straight back in. */
export function JoinScreen() {
  const params = useParams();
  const linked = normalizeCode(params.code ?? "");
  const resume = linked ? (canResume(linked) ? linked : null) : resumableRoom();
  if (resume) return <Navigate to={`/r/${resume}`} replace />;
  return <JoinForm />;
}

function JoinForm() {
  const t = useT();
  const params = useParams();
  const navigate = useNavigate();
  const { account } = useAccount();
  // Signed in: the account's name and avatar. Guests: whatever they used last time.
  const initial = account ? { nickname: account.displayName, avatarSeed: account.avatarSeed } : loadIdentity();
  const [code, setCode] = useState(normalizeCode(params.code ?? ""));
  const [nickname, setNickname] = useState(initial.nickname);
  const [seed, setSeed] = useState(initial.avatarSeed);
  const [error, setError] = useState<{ field: "code" | "form"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const cleanup = useRef<() => void>(() => {});
  const nickRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (params.code) nickRef.current?.focus();
    return () => cleanup.current();
  }, [params.code]);

  const fail = (c: ErrorCode, text?: string) => {
    setBusy(false);
    setError({ field: c === "room_not_found" ? "code" : "form", text: text ?? errorText(c) });
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const name = nickname.trim();
    if (!isRoomCode(code.replace(/-+$/, ""))) return setError({ field: "code", text: t("join.codeHint", { example: ROOM_CODE_EXAMPLE }) });
    if (!name) return nickRef.current?.focus();
    setError(null);
    setBusy(true);
    try {
      const info = await getSearchApi().roomInfo(code);
      if (!info.exists) return fail("room_not_found");
      if (info.status === "ended") return fail("room_ended");
      if (info.locked) return fail("room_locked");
    } catch {
      return fail("invalid_message", t("join.unreachable"));
    }
    const identity = { nickname: name, avatarSeed: seed };
    saveIdentity(identity);
    dropRoomClient(code);
    const client = getRoomClient(code, identity);
    const done = (ok: boolean) => {
      cleanup.current();
      if (ok) {
        markJoined(code, true);
        navigate(`/r/${code}`);
      }
    };
    const offState = client.subscribe(() => {
      if (client.me) done(true);
    });
    const offError = client.onError((err) => {
      done(false);
      dropRoomClient(code);
      fail(err.code);
    });
    const timer = setTimeout(() => {
      done(false);
      dropRoomClient(code);
      fail("invalid_message", t("join.slow"));
    }, 12000);
    cleanup.current = () => {
      offState();
      offError();
      clearTimeout(timer);
      cleanup.current = () => {};
    };
  };

  return (
    <div className={css.page}>
      <header className={css.top}>
        <Logo size={32} />
      </header>
      <form className={css.card} onSubmit={submit} noValidate>
        <h1 className={css.title}>{t("join.title")}</h1>
        <p className={css.lead}>{t("join.lead")}</p>

        <AvatarPicker value={seed} onChange={setSeed} />

        <TextField
          label={t("join.code")}
          value={code}
          onChange={(e) => {
            setCode(normalizeCode(e.target.value));
            if (error?.field === "code") setError(null);
          }}
          placeholder={ROOM_CODE_EXAMPLE}
          autoCapitalize="none"
          autoComplete="off"
          spellCheck={false}
          inputMode="text"
          className={css.code}
          error={error?.field === "code" ? error.text : null}
        />
        <TextField
          ref={nickRef}
          label={t("join.nickname")}
          value={nickname}
          onChange={(e) => setNickname(e.target.value.slice(0, 20))}
          placeholder={t("join.nicknamePlaceholder")}
          autoComplete="nickname"
          enterKeyHint="go"
        />

        {error?.field === "form" && (
          <p className={css.formError} role="alert">
            {error.text}
          </p>
        )}

        <Button type="submit" size="lg" block disabled={busy || !nickname.trim() || !isRoomCode(code.replace(/-+$/, ""))}>
          {busy ? t("join.joining") : t("join.submit")}
        </Button>
        {USE_MOCK && (
          <p className={css.hint}>
            Demo mode: any code works. Try <b>no-such-party</b>, <b>locked-door-party</b> or <b>party-is-over</b> for the error states.
          </p>
        )}
      </form>
      <p className={css.hint}>
        {t("join.host")} <Link to="/host/new">{t("join.hostLink")}</Link>
      </p>
      <p className={css.hint}>
        <Link to="/account">{account ? t("acct.linkIn", { name: account.displayName }) : t("acct.link")}</Link>
      </p>
      <LanguageSwitcher />
    </div>
  );
}
