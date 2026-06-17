import { useColorScheme } from "react-native";
import { useSettingsStore } from "../store/useSettingsStore";
import { getTheme, ThemeTokens } from "./index";

export function useTheme(): ThemeTokens {
  const theme = useSettingsStore((s) => s.theme);
  const sys = useColorScheme();
  return getTheme(theme, sys === "dark");
}
