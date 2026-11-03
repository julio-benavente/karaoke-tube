import { ROOM_CODE_EXAMPLE, isRoomCode } from "@karaoke-tube/shared";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router";
import type { ErrorCode } from "@karaoke-tube/shared";
import { AvatarPicker, Button, Logo, TextField, errorText } from "@karaoke-tube/ui";
import {
  dropRoomClient,
  getRoomClient,
  getSearchApi,
  loadIdentity,
  markJoined,
  normalizeCode,
  saveIdentity,
  USE_MOCK,
} from "../session";
import css from "./Join.module.css";

/** G1: code, avatar with re-roll, nickname, Join. */
export function JoinScreen() {
  const params = useParams();
  const navigate = useNavigate();
  const initial = loadIdentity();
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
    if (!isRoomCode(code.replace(/-+$/, ""))) return setError({ field: "code", text: `Party codes look like ${ROOM_CODE_EXAMPLE}.` });
    if (!name) return nickRef.current?.focus();
    setError(null);
    setBusy(true);
    try {
      const info = await getSearchApi().roomInfo(code);
      if (!info.exists) return fail("room_not_found");
      if (info.status === "ended") return fail("room_ended");
      if (info.locked) return fail("room_locked");
    } catch {
      return fail("invalid_message", "Can't reach the party right now. Check your connection.");
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
      fail("invalid_message", "Joining is taking too long. Try again.");
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
        <h1 className={css.title}>Join the party</h1>
        <p className={css.lead}>Pick a look and a name. Everyone will see them on the TV.</p>

        <AvatarPicker value={seed} onChange={setSeed} />

        <TextField
          label="Party code"
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
          label="Nickname"
          value={nickname}
          onChange={(e) => setNickname(e.target.value.slice(0, 20))}
          placeholder="What should we call you?"
          autoComplete="nickname"
          enterKeyHint="go"
        />

        {error?.field === "form" && (
          <p className={css.formError} role="alert">
            {error.text}
          </p>
        )}

        <Button type="submit" size="lg" block disabled={busy || !nickname.trim() || !isRoomCode(code.replace(/-+$/, ""))}>
          {busy ? "Joining…" : "Join"}
        </Button>
        {USE_MOCK && (
          <p className={css.hint}>
            Demo mode: any code works. Try <b>no-such-party</b>, <b>locked-door-party</b> or <b>party-is-over</b> for the error states.
          </p>
        )}
      </form>
    </div>
  );
}
