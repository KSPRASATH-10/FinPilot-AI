import { create } from "zustand";

type Theme = "dark" | "light" | "system";
type Language = "en" | "ta";

interface SettingsState {
  theme: Theme;
  language: Language;
  currency: string;
  notifications: boolean;
  biometrics: boolean;
  setTheme: (t: Theme) => void;
  setLanguage: (l: Language) => void;
  setCurrency: (c: string) => void;
  setNotifications: (v: boolean) => void;
  setBiometrics: (v: boolean) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  theme: "dark",
  language: "en",
  currency: "INR",
  notifications: true,
  biometrics: false,
  setTheme: (theme) => set({ theme }),
  setLanguage: (language) => set({ language }),
  setCurrency: (currency) => set({ currency }),
  setNotifications: (notifications) => set({ notifications }),
  setBiometrics: (biometrics) => set({ biometrics }),
}));