import * as SecureStore from "expo-secure-store";
import { create } from "zustand";

const MACRO_CARDS_KEY = "egx.macroCards";

/** Card keys follow the API's MACRO_KEYS order. */
export const MACRO_CARD_KEYS = [
  "usd_egp",
  "brent",
  "wti",
  "gold_oz",
  "gold_egp_24k",
  "gold_egp_21k",
] as const;

export type MacroCardKey = (typeof MACRO_CARD_KEYS)[number];

type MacroPrefsState = {
  hydrated: boolean;
  /** Cards the user hid from the home strip; absent = visible. */
  hidden: Partial<Record<MacroCardKey, boolean>>;
  hydrate: () => Promise<void>;
  toggle: (key: MacroCardKey, visible: boolean) => Promise<void>;
};

export const useMacroPrefsStore = create<MacroPrefsState>((set, get) => ({
  hydrated: false,
  hidden: {},
  hydrate: async () => {
    if (get().hydrated) {
      return;
    }

    const stored = await SecureStore.getItemAsync(MACRO_CARDS_KEY).catch(
      () => null,
    );

    if (stored) {
      try {
        const parsed = JSON.parse(stored) as Partial<
          Record<MacroCardKey, boolean>
        >;
        set({ hidden: parsed });
      } catch {
        // Corrupt payload — fall back to defaults.
      }
    }

    set({ hydrated: true });
  },
  toggle: async (key, visible) => {
    const hidden = { ...get().hidden };

    if (visible) {
      delete hidden[key];
    } else {
      hidden[key] = true;
    }

    await SecureStore.setItemAsync(MACRO_CARDS_KEY, JSON.stringify(hidden)).catch(
      () => undefined,
    );
    set({ hidden });
  },
}));
