import type { ClientMessage, ConnectionStatus, ErrorCode, Member, Reaction, RoomClient, RoomState } from "@karaoke-tube/shared";

export type CloseReason = "kicked" | "ended" | "left" | null;
type ReactionEvent = { memberId: string; reaction: Reaction };
type ErrorEvent = { code: ErrorCode; message: string };

/**
 * The listener plumbing every `RoomClient` shares. Transports (WebSocket, chrome.runtime port)
 * extend it and call `setState` / `setStatus` / `emitReaction` / `emitError`.
 */
export abstract class BaseRoomClient implements RoomClient {
  status: ConnectionStatus = "connecting";
  state: RoomState | null = null;
  /** Why status became "closed": the server sent `kicked` / `ended`, or `close()` was called ("left"). */
  closeReason: CloseReason = null;
  protected memberId: string | null = null;

  private listeners = new Set<() => void>();
  private reactionListeners = new Set<(e: ReactionEvent) => void>();
  private errorListeners = new Set<(e: ErrorEvent) => void>();

  get me(): Member | null {
    if (!this.state || !this.memberId) return null;
    return this.state.members.find((m) => m.id === this.memberId) ?? null;
  }

  abstract send(msg: ClientMessage): void;
  abstract close(): void;

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onReaction(listener: (e: ReactionEvent) => void): () => void {
    this.reactionListeners.add(listener);
    return () => this.reactionListeners.delete(listener);
  }

  onError(listener: (e: ErrorEvent) => void): () => void {
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
  }

  protected setState(state: RoomState | null, memberId = this.memberId) {
    this.state = state;
    this.memberId = memberId;
    this.notify();
  }

  protected setStatus(status: ConnectionStatus) {
    if (this.status === status) return;
    this.status = status;
    this.notify();
  }

  protected emitReaction(e: ReactionEvent) {
    for (const l of [...this.reactionListeners]) l(e);
  }

  protected emitError(e: ErrorEvent) {
    for (const l of [...this.errorListeners]) l(e);
  }

  /** Listeners read `state` / `status` / `me` again. `state` is a new object after every server update. */
  private notify() {
    for (const l of [...this.listeners]) l();
  }
}
