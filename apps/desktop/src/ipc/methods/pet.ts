import * as Electron from "electron";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

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
    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
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
