import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

import { PetWidget } from "../neo/pets/PetWidget";

/**
 * The detached desktop pet window loads this route on a transparent
 * BrowserWindow. It is a full client (same auth bootstrap), so the pet reads
 * live thread state directly, hears about typing over a BroadcastChannel, and
 * only needs IPC for moving the window and focusing the main one.
 */
function PetWindowRoute() {
  useEffect(() => {
    document.documentElement.dataset.neoPetWindow = "true";
    return () => {
      delete document.documentElement.dataset.neoPetWindow;
    };
  }, []);
  return <PetWidget />;
}

export const Route = createFileRoute("/pet")({
  component: PetWindowRoute,
});
