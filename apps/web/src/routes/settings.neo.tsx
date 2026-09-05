import { createFileRoute } from "@tanstack/react-router";

import { NeoSettingsPanel } from "../components/settings/NeoSettingsPanel";

function SettingsNeoRoute() {
  return <NeoSettingsPanel />;
}

export const Route = createFileRoute("/settings/neo")({
  component: SettingsNeoRoute,
});
