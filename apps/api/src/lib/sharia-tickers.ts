/**
 * Curated seed list of sharia-compliant EGX tickers.
 *
 * This is a static, hand-curated list of well-known EGX companies generally
 * regarded as sharia-compliant (banks, insurance, and conventional financial
 * companies are excluded). Any ticker not present in the `instruments` table
 * is ignored at query time, so errors degrade gracefully.
 *
 * TODO: replace with official EGX33 Sharia index constituents once a reliable
 * source is available. Keep this file the single source of truth.
 */
export const SHARIA_TICKERS = [
  "ABUK", // Abu Qir Fertilizers
  "SIDI", // Sidpec
  "MFPC", // Misr Fertilizers (MOPCO)
  "AMOC", // Alexandria Mineral Oils
  "ETEL", // Telecom Egypt
  "SWDY", // Elsewedy Electric
  "ORHD", // Orascom Development Holding
  "TMGH", // Talaat Moustafa Group
  "ORWE", // Oriental Weavers
  "EFID", // Egyptian Financial & Industrial
  "ISPH", // Ibnsina Pharma
  "CLHO", // Cleopatra Hospitals
  "DOMTY", // Domty
  "ALCN", // Alexandria Container & Handling
] as const;
