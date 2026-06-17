export const DARK = {
  bg: "#080C14",
  surface: "rgba(255,255,255,0.04)",
  surfaceHigh: "rgba(255,255,255,0.08)",
  border: "rgba(255,255,255,0.09)",
  borderHigh: "rgba(255,255,255,0.18)",
  text: "#F0F4FF",
  textSub: "rgba(240,244,255,0.55)",
  textMuted: "rgba(240,244,255,0.30)",
  accent: "#3D7FFF",
  accentGlow: "rgba(61,127,255,0.25)",
  accentAlt: "#A78BFA",
  success: "#22D3A0",
  danger: "#F43F5E",
  warning: "#FBBF24",
  card: "rgba(255,255,255,0.05)",
  cardBorder: "rgba(255,255,255,0.10)",
  tabBg: "rgba(8,12,20,0.92)",
  inputBg: "rgba(255,255,255,0.06)",
  shadow: "rgba(0,0,0,0.55)",
  gradientA: "#1A2B55",
  gradientB: "#0D1B38",
};

export const LIGHT = {
  bg: "#F2F5FB",
  surface: "rgba(0,0,0,0.03)",
  surfaceHigh: "rgba(0,0,0,0.06)",
  border: "rgba(0,0,0,0.08)",
  borderHigh: "rgba(0,0,0,0.15)",
  text: "#0D1B38",
  textSub: "rgba(13,27,56,0.60)",
  textMuted: "rgba(13,27,56,0.35)",
  accent: "#2563EB",
  accentGlow: "rgba(37,99,235,0.18)",
  accentAlt: "#7C3AED",
  success: "#059669",
  danger: "#E11D48",
  warning: "#D97706",
  card: "#FFFFFF",
  cardBorder: "rgba(0,0,0,0.08)",
  tabBg: "rgba(242,245,251,0.95)",
  inputBg: "rgba(0,0,0,0.04)",
  shadow: "rgba(0,0,0,0.12)",
  gradientA: "#DBEAFE",
  gradientB: "#EDE9FE",
};

export type ThemeTokens = typeof DARK;

export function getTheme(scheme: "dark" | "light" | "system", systemIsDark: boolean): ThemeTokens {
  if (scheme === "dark") return DARK;
  if (scheme === "light") return LIGHT;
  return systemIsDark ? DARK : LIGHT;
}
