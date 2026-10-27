const SECTOR_KEYS: Record<string, string> = {
  Finance: "finance",
  "Process Industries": "processIndustries",
  "Non-Energy Minerals": "nonEnergyMinerals",
  "Industrial Services": "industrialServices",
  "Consumer Services": "consumerServices",
  "Consumer Non-Durables": "consumerNonDurables",
  "Producer Manufacturing": "producerManufacturing",
  "Health Technology": "healthTechnology",
  "Distribution Services": "distributionServices",
  "Consumer Durables": "consumerDurables",
  "Technology Services": "technologyServices",
  "Health Services": "healthServices",
  "Commercial Services": "commercialServices",
  Transportation: "transportation",
  "Retail Trade": "retailTrade",
  Utilities: "utilities",
  Communications: "communications",
  Miscellaneous: "miscellaneous",
  "Energy Minerals": "energyMinerals",
  "Electronic Technology": "electronicTechnology",
  Other: "other",
};

/** Maps TradingView's English sector names to stable i18n keys. */
export function sectorKey(sector: string | null | undefined): string {
  return (sector && SECTOR_KEYS[sector]) || "other";
}
