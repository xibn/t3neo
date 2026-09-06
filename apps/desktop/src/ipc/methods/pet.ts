import * as Data from "effect/Data";
import * as Electron from "electron";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { HttpClient } from "effect/unstable/http";

import * as DesktopEnvironment from "../../app/DesktopEnvironment.ts";
import * as ElectronWindow from "../../electron/ElectronWindow.ts";
import { getDesktopUrl } from "../../electron/ElectronProtocol.ts";
import * as DesktopWindow from "../../window/DesktopWindow.ts";
import * as IpcChannels from "../channels.ts";
import * as DesktopIpc from "../DesktopIpc.ts";
import { MENU_ACTION_CHANNEL } from "../channels.ts";

/**
 * T3 Neo pet window: a small transparent, frameless, always-on-top window
 * that loads the `/pet` route so the pet stays visible over other apps. It
 * never takes keyboard focus, so menu shortcuts keep targeting the main
 * window, and it closes together with the main window.
 */
const PET_WINDOW_WIDTH = 280;
const PET_WINDOW_HEIGHT = 380;
const PET_WINDOW_MARGIN = 24;

let petWindow: Electron.BrowserWindow | null = null;

function livePetWindow(): Electron.BrowserWindow | null {
  if (petWindow === null || petWindow.isDestroyed()) {
    petWindow = null;
  }
  return petWindow;
}

function initialPetWindowPosition(): { x: number; y: number } {
  const workArea = Electron.screen.getPrimaryDisplay().workArea;
  return {
    x: workArea.x + workArea.width - PET_WINDOW_WIDTH - PET_WINDOW_MARGIN,
    y: workArea.y + workArea.height - PET_WINDOW_HEIGHT - PET_WINDOW_MARGIN,
  };
}

export const openPetWindow = DesktopIpc.makeIpcMethod({
  channel: IpcChannels.PET_OPEN_WINDOW_CHANNEL,
  payload: Schema.Void,
  result: Schema.Void,
  handler: Effect.fn("desktop.ipc.pet.openWindow")(function* () {
    const existing = livePetWindow();
    if (existing !== null) {
      existing.showInactive();
      return;
    }
    const environment = yield* DesktopEnvironment.DesktopEnvironment;
    const electronWindow = yield* ElectronWindow.ElectronWindow;
    const mainWindow = yield* electronWindow.main;
    const window = yield* electronWindow.create({
      ...initialPetWindowPosition(),
      width: PET_WINDOW_WIDTH,
      height: PET_WINDOW_HEIGHT,
      show: false,
      frame: false,
      transparent: true,
      hasShadow: false,
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      focusable: false,
      alwaysOnTop: true,
      backgroundColor: "#00000000",
      title: `${environment.displayName} Pet`,
      webPreferences: {
        preload: environment.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    petWindow = window;
    window.setAlwaysOnTop(true, "floating");
    // Without skipTransformProcessType, Electron turns the whole app into a
    // macOS accessory process to get the window above fullscreen apps, which
    // removes it from the Dock. The Dock icon matters more than floating over
    // fullscreen apps, so the process type stays as it is.
    window.setVisibleOnAllWorkspaces(true, {
      visibleOnFullScreen: true,
      skipTransformProcessType: true,
    });
    window.setMenuBarVisibility(false);
    window.once("ready-to-show", () => {
      if (!window.isDestroyed()) window.showInactive();
    });
    window.on("closed", () => {
      if (petWindow === window) petWindow = null;
    });
    if (Option.isSome(mainWindow)) {
      mainWindow.value.once("closed", () => {
        if (!window.isDestroyed()) window.close();
      });
    }
    yield* Effect.promise(() => window.loadURL(`${getDesktopUrl(environment.isDevelopment)}#/pet`));
  }),
});

export const closePetWindow = DesktopIpc.makeIpcMethod({
  channel: IpcChannels.PET_CLOSE_WINDOW_CHANNEL,
  payload: Schema.Void,
  result: Schema.Void,
  handler: Effect.fn("desktop.ipc.pet.closeWindow")(function* () {
    const existing = livePetWindow();
    if (existing !== null) {
      yield* Effect.sync(() => existing.close());
    }
  }),
});

export const movePetWindow = DesktopIpc.makeIpcMethod({
  channel: IpcChannels.PET_MOVE_WINDOW_CHANNEL,
  payload: Schema.Struct({ dx: Schema.Number, dy: Schema.Number }),
  result: Schema.Void,
  handler: Effect.fn("desktop.ipc.pet.moveWindow")(function* (delta) {
    const existing = livePetWindow();
    if (existing === null) return;
    yield* Effect.sync(() => {
      const [x = 0, y = 0] = existing.getPosition();
      existing.setPosition(Math.round(x + delta.dx), Math.round(y + delta.dy));
    });
  }),
});

/**
 * Hosts the pet gallery browser may fetch through the main process. Some
 * galleries refuse cross-origin requests from the renderer, and the app's
 * own scheme is always cross-origin to them; a main-process request carries
 * no Origin header. Everything else stays in the renderer.
 */
export const PET_GALLERY_HOSTS: ReadonlyArray<string> = [
  "raw.githubusercontent.com",
  "codexpet.top",
  "codex-pet.com",
  "codexpets.org",
  "openpets.sh",
];

export class DesktopPetGalleryFetchError extends Data.TaggedError("DesktopPetGalleryFetchError")<{
  readonly url: string;
  readonly reason: "invalid-url" | "host-not-allowed" | "request-failed";
  readonly cause?: unknown;
}> {
  override get message(): string {
    switch (this.reason) {
      case "invalid-url":
        return `Pet gallery URL is not valid: ${this.url}`;
      case "host-not-allowed":
        return `Pet gallery host is not allowed: ${this.url}`;
      case "request-failed":
        return `Pet gallery request failed: ${this.url}`;
    }
  }
}

export function isAllowedPetGalleryUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && PET_GALLERY_HOSTS.includes(parsed.hostname);
  } catch {
    return false;
  }
}

export const fetchPetGallery = DesktopIpc.makeIpcMethod({
  channel: IpcChannels.PET_FETCH_GALLERY_CHANNEL,
  payload: Schema.String,
  result: Schema.Struct({
    status: Schema.Number,
    contentType: Schema.NullOr(Schema.String),
    body: Schema.Uint8Array,
  }),
  handler: Effect.fn("desktop.ipc.pet.fetchGallery")(function* (url) {
    if (!isAllowedPetGalleryUrl(url)) {
      const reason = URL.canParse(url) ? "host-not-allowed" : "invalid-url";
      return yield* new DesktopPetGalleryFetchError({ url, reason });
    }
    const response = yield* HttpClient.get(url).pipe(
      Effect.mapError(
        (cause) => new DesktopPetGalleryFetchError({ url, reason: "request-failed", cause }),
      ),
    );
    const body = yield* response.arrayBuffer.pipe(
      Effect.mapError(
        (cause) => new DesktopPetGalleryFetchError({ url, reason: "request-failed", cause }),
      ),
    );
    return {
      status: response.status,
      contentType: response.headers["content-type"] ?? null,
      body: new Uint8Array(body),
    };
  }),
});

export const focusMainFromPet = DesktopIpc.makeIpcMethod({
  channel: IpcChannels.PET_FOCUS_MAIN_CHANNEL,
  payload: Schema.NullOr(Schema.Struct({ environmentId: Schema.String, threadId: Schema.String })),
  result: Schema.Void,
  handler: Effect.fn("desktop.ipc.pet.focusMain")(function* (target) {
    const desktopWindow = yield* DesktopWindow.DesktopWindow;
    const window = yield* desktopWindow.revealOrCreateMain;
    if (target === null) return;
    const action = `open-thread:${target.environmentId}:${target.threadId}`;
    const send = () => {
      if (!window.isDestroyed()) window.webContents.send(MENU_ACTION_CHANNEL, action);
    };
    if (window.webContents.isLoading()) {
      window.webContents.once("did-finish-load", send);
    } else {
      send();
    }
  }),
});
