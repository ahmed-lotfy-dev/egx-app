import * as SecureStore from "expo-secure-store";
import { create } from "zustand";

const CHART_MODE_KEY = "egx.chartMode";

export type ChartMode = "line" | "candles";

type ChartModeState = {
  hydrated: boolean;
  mode: ChartMode;
  hydrate: () => Promise<void>;
  setMode: (mode: ChartMode) => Promise<void>;
};

export const useChartModeStore = create<ChartModeState>((set, get) => ({
  hydrated: false,
  mode: "line",
  hydrate: async () => {
    if (get().hydrated) {
      return;
    }

    const stored = await SecureStore.getItemAsync(CHART_MODE_KEY).catch(
      () => null,
    );
    const mode: ChartMode = stored === "candles" ? "candles" : "line";

    set({ hydrated: true, mode });
  },
  setMode: async (mode) => {
    await SecureStore.setItemAsync(CHART_MODE_KEY, mode).catch(
      () => undefined,
    );
    set({ mode });
  },
}));
