import { LegalPage } from "./screens/Legal";
import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { Spinner } from "@karaoke-tube/ui";
import { Landing } from "./screens/Landing";
import { JoinScreen } from "./screens/Join";
import { RoomShell } from "./screens/RoomShell";
import { HomeScreen } from "./screens/Home";
import { SearchScreen } from "./screens/Search";
import { QueueScreen } from "./screens/Queue";
import { PartyScreen } from "./screens/Party";
import { RecapPage } from "./screens/RecapPage";
import { AccountProvider } from "./account/AccountContext";
import { AccountPage } from "./account/AccountPage";

// Design previews live under /dev/*. They exist only in development: in a production build DEV is false, so these routes
// are not registered and the preview code is dropped from the bundle (a /dev/... address falls through to /join).
const DEV = import.meta.env.DEV;
const Gallery = DEV ? lazy(() => import("./dev/Gallery").then((m) => ({ default: m.Gallery }))) : () => null;
const HostApp = lazy(() => import("./host/HostApp").then((m) => ({ default: m.HostApp })));
const NewParty = lazy(() => import("./host/NewParty").then((m) => ({ default: m.NewParty })));
const TvPair = lazy(() => import("./tv/TvPair").then((m) => ({ default: m.TvPair })));
const TvScreen = lazy(() => import("./tv/TvScreen").then((m) => ({ default: m.TvScreen })));
const RecapDev = DEV ? lazy(() => import("./dev/RecapDev").then((m) => ({ default: m.RecapDev }))) : () => null;
const SongCards = DEV ? lazy(() => import("./dev/SongCards").then((m) => ({ default: m.SongCards }))) : () => null;
const Posters = DEV ? lazy(() => import("./dev/Posters").then((m) => ({ default: m.Posters }))) : () => null;
const TvPreview = DEV ? lazy(() => import("./dev/TvPreview").then((m) => ({ default: m.TvPreview }))) : () => null;

export function App() {
  return (
    <AccountProvider>
    <BrowserRouter>
      <Suspense fallback={<Spinner />}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/join/:code?" element={<JoinScreen />} />
          <Route path="/r/:code" element={<RoomShell />}>
            <Route index element={<HomeScreen />} />
            <Route path="search" element={<SearchScreen />} />
            <Route path="queue" element={<QueueScreen />} />
            <Route path="party" element={<PartyScreen />} />
          </Route>
          <Route path="/privacy" element={<LegalPage doc="privacy" />} />
          <Route path="/terms" element={<LegalPage doc="terms" />} />
          <Route path="/account" element={<AccountPage />} />
          <Route path="/recap/:id" element={<RecapPage />} />
          <Route path="/host/new" element={<NewParty />} />
          <Route path="/tv" element={<TvPair />} />
          <Route path="/tv/:code" element={<TvScreen />} />
          <Route path="/host/:code/*" element={<HostApp />} />
          {DEV && <Route path="/dev/ui" element={<Gallery />} />}
          {DEV && <Route path="/dev/recap" element={<RecapDev />} />}
          {DEV && <Route path="/dev/tv" element={<TvPreview />} />}
          {DEV && <Route path="/dev/song-cards" element={<SongCards />} />}
          {DEV && <Route path="/dev/posters" element={<Posters />} />}
          <Route path="*" element={<Navigate to="/join" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
    </AccountProvider>
  );
}
