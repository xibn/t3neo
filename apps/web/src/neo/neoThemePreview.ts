import type { ThemeCardPreviewColors } from "../components/settings/ThemePreviewCircles";
import type { ThemeAppearance } from "../themePalette";

/**
 * The Neo look's palette for the color scheme mockups in Settings. Mirrors
 * the surfaces in looks/neo.css, since the look overrides whatever theme was
 * picked before and the mockups must show what the app actually renders.
 */
export const NEO_THEME_PREVIEW_COLORS: Readonly<Record<ThemeAppearance, ThemeCardPreviewColors>> = {
  light: {
    sidebar: "#d1c6b5",
    canvas: "#e3d9cb",
    surface: "#ede5da",
    accentSurface: "#d8cdbd",
    accent: "#d8cdbd",
    messageSurface: "#dcd1c1",
    messageAction: "#c8641f",
  },
  dark: {
    sidebar: "#0c0b0a",
    canvas: "#110f0d",
    surface: "#171412",
    accentSurface: "#221e1a",
    accent: "#221e1a",
    messageSurface: "#1f1a16",
    messageAction: "#f2a26e",
  },
};
