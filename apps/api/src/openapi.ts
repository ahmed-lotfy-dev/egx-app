export const OPENAPI_INFO = {
  title: "EGX API",
  version: "0.1.0",
  description: "Market data, instruments, news, positions, alerts, and AI for the EGX app.",
} as const;

export const OPENAPI_CONFIG = {
  openapi: "3.1.0",
  info: OPENAPI_INFO,
} as const;
