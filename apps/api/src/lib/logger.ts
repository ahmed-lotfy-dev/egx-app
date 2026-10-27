import pino from "pino";

import { env } from "../config/env";

export const logger = pino({
  level: env.NODE_ENV === "production" ? "info" : "debug",
  ...(env.NODE_ENV === "development"
    ? {
        transport: {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "SYS:standard" },
        },
      }
    : {}),
});
