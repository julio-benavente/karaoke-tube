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

const Gallery = lazy(() => import("./dev/Gallery").then((m) => ({ default: m.Gallery })));
const HostApp = lazy(() => import("./host/HostApp").then((m) => ({ default: m.HostApp })));
const NewParty = lazy(() => import("./host/NewParty").then((m) => ({ default: m.NewParty })));
const TvPair = lazy(() => import("./tv/TvPair").then((m) => ({ default: m.TvPair })));
const TvScreen = lazy(() => import("./tv/TvScreen").then((m) => ({ default: m.TvScreen })));
const RecapDev = lazy(() => import("./dev/RecapDev").then((m) => ({ default: m.RecapDev })));
const TvPreview = lazy(() => import("./dev/TvPreview").then((m) => ({ default: m.TvPreview })));

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
          <Route path="/account" element={<AccountPage />} />
          <Route path="/recap/:id" element={<RecapPage />} />
          <Route path="/host/new" element={<NewParty />} />
          <Route path="/tv" element={<TvPair />} />
          <Route path="/tv/:code" element={<TvScreen />} />
          <Route path="/host/:code" element={<HostApp />} />
          <Route path="/dev/ui" element={<Gallery />} />
          <Route path="/dev/recap" element={<RecapDev />} />
          <Route path="/dev/tv" element={<TvPreview />} />
          <Route path="*" element={<Navigate to="/join" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
    </AccountProvider>
  );
}
