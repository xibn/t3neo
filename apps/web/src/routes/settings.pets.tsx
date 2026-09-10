import { createFileRoute } from "@tanstack/react-router";

import { PetSettingsPanel } from "../components/settings/PetSettingsPanel";

function SettingsPetsRoute() {
  return <PetSettingsPanel />;
}

export const Route = createFileRoute("/settings/pets")({
  component: SettingsPetsRoute,
});
