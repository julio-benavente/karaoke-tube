import { useState } from "react";
import { APP_NAME } from "@karaoke-tube/shared";
import { API_URL, type ExtMessage } from "@/utils/api";

export function App() {
  const [result, setResult] = useState("not checked yet");

  const ping = async () => {
    console.log("[popup] pinging API via background");
    setResult("checking…");
    const res = await browser.runtime.sendMessage({ type: "PING_API" } satisfies ExtMessage);
    console.log("[popup] result:", res);
    setResult(JSON.stringify(res, null, 2));
  };

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: 12, width: 300 }}>
      <h3 style={{ margin: "0 0 8px" }}>{APP_NAME} 🎤</h3>
      <p style={{ fontSize: 12, color: "#666" }}>API: {API_URL}</p>
      <button onClick={ping}>Ping API</button>
      <pre style={{ fontSize: 11, whiteSpace: "pre-wrap" }}>{result}</pre>
    </main>
  );
}
