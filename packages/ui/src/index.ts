// @karaoke-tube/ui: design tokens, components, hooks and the mock client.
// Global styles: import "@karaoke-tube/ui/styles" once at the app entry.
// TV overlay components: "@karaoke-tube/ui/tv" (shadow-root safe).

export * from "./hooks/room";
export * from "./hooks/add-song";
export * from "./hooks/turn-alert";
export * from "./browse";
export * from "./avatar";
export * from "./format";
export * from "./i18n";

export { createMockRoomClient, errorText } from "./mock/mock-room-client";
export type { MockRoomClient, MockRoomOptions, MockControls, SimulateOptions } from "./mock/mock-room-client";
export { createMockSearchApi, MOCK_CODES } from "./mock/mock-search-api";
export { SAMPLE_SONGS, sampleRecap } from "./mock/sample-data";

export { Avatar, AvatarStack } from "./components/Avatar";
export { AvatarPicker, type AvatarPickerProps } from "./components/AvatarPicker";
export { Artwork, hueOf, tintOf } from "./components/Artwork";
export { Button, IconButton, PlayButton } from "./components/Button";
export { Chip, ChipRow, Pill } from "./components/Chip";
export { Tile, ShortcutTile } from "./components/Tile";
export { Card, Shelf } from "./components/Card";
export { SongRow } from "./components/SongRow";
export { QueueRow, Equalizer, singerNames } from "./components/QueueRow";
export { ProgressBar } from "./components/ProgressBar";
export { PlayerBar, PlayerBarDivider } from "./components/PlayerBar";
export { MiniPlayer } from "./components/MiniPlayer";
export { BottomTabs, type Tab } from "./components/BottomTabs";
export { Toggle } from "./components/Toggle";
export { Toast, ToastProvider, useToast } from "./components/Toast";
export { Sheet, ActionList } from "./components/Sheet";
export { EmptyState, Mark, Logo, Spinner, TextField, Banner } from "./components/EmptyState";
export { AddGuestSheet } from "./components/AddGuestSheet";
export { ChangeAvatarSheet } from "./components/ChangeAvatarSheet";
export { SingWithProvider, SingWithPicker, SingWithButton, useSingWith, type UseSingWith } from "./components/SingWith";
