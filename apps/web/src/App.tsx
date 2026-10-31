import { useEffect, useRef, useState } from "react";
import { APP_NAME, type HealthResponse, type RoomMessage } from "@karaoke-tube/shared";

const ROOM_CODE = "TEST";

export function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<RoomMessage[]>([]);
  const wsRef = useRef<WebSocket | null>(null);

  // 1. Plain HTTP call to the Worker.
  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json() as Promise<HealthResponse>)
      .then((data) => {
        console.log("[web] health:", data);
        setHealth(data);
      })
      .catch((e) => {
        console.error("[web] health failed:", e);
        setError(String(e));
      });
  }, []);

  // 2. WebSocket to the room's Durable Object.
  useEffect(() => {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/api/rooms/${ROOM_CODE}/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("[web] room socket open");
      ws.send(JSON.stringify({ type: "hello", from: "web" } satisfies RoomMessage));
    };
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data) as RoomMessage;
      console.log("[web] room message:", msg);
      setMessages((m) => [...m, msg]);
    };
    ws.onclose = () => console.log("[web] room socket closed");

    return () => ws.close();
  }, []);

  const sendPing = () => {
    wsRef.current?.send(
      JSON.stringify({ type: "chat", from: "web", text: "ping!" } satisfies RoomMessage),
    );
  };

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: 16, maxWidth: 600 }}>
      <h1>{APP_NAME} 🎤</h1>

      <h2>API health</h2>
      <pre>{error ?? (health ? JSON.stringify(health, null, 2) : "loading…")}</pre>

      <h2>Room {ROOM_CODE}</h2>
      <button onClick={sendPing}>Send ping to room</button>
      <ul>
        {messages.map((m, i) => (
          <li key={i}>
            <code>{JSON.stringify(m)}</code>
          </li>
        ))}
      </ul>
    </main>
  );
}
