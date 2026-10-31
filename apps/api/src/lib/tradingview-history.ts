/**
 * TradingView's unofficial chart websocket — shared by the worker (daily bar
 * syncs) and the API (on-demand intraday bars). Messages use TV's
 * `~m~<len>~m~` framing and `~h~N` heartbeats must be echoed back.
 */

export type TvBar = [number, number, number, number, number, number];

/** Supported resolutions: "D" daily, or minute counts like "1", "5", "15". */
export type TvResolution = "D" | "1" | "5" | "15" | "30" | "60";

const WS_URL = "wss://data.tradingview.com/socket.io/websocket";

function frame(payload: string): string {
  return `~m~${payload.length}~m~${payload}`;
}

export function tvHistory(
  symbol: string,
  resolution: TvResolution,
  count: number,
): Promise<TvBar[]> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL, {
      headers: { Origin: "https://www.tradingview.com" },
    });
    const byTime = new Map<number, TvBar>();
    let settled = false;

    const finish = (error?: Error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      try {
        ws.close();
      } catch {
        // already closed
      }
      if (error) {
        reject(error);
      } else {
        resolve([...byTime.values()].sort((a, b) => a[0] - b[0]));
      }
    };

    const timer = setTimeout(
      () => finish(new Error(`TradingView history timeout for ${symbol}`)),
      20_000,
    );

    const send = (method: string, params: unknown[]) => {
      ws.send(frame(JSON.stringify({ m: method, p: params })));
    };

    ws.onopen = () => {
      send("set_auth_token", ["unauthorized_user_token"]);
      send("chart_create_session", ["cs_egx"]);
      send("resolve_symbol", [
        "cs_egx",
        "ser_1",
        `=${JSON.stringify({ symbol, adjustment: "splits" })}`,
      ]);
      send("create_series", ["cs_egx", "$prices", "s1", "ser_1", resolution, count]);
    };

    ws.onmessage = (event) => {
      const raw = typeof event.data === "string" ? event.data : "";
      let cursor = 0;

      while (cursor < raw.length) {
        const heartbeat = raw.indexOf("~h~", cursor);
        const message = raw.indexOf("~m~", cursor);

        if (heartbeat !== -1 && (message === -1 || heartbeat < message)) {
          const numberEnd = raw.indexOf("~", heartbeat + 3);
          ws.send(frame(`~h~${raw.slice(heartbeat + 3, numberEnd)}`));
          cursor = numberEnd;
          continue;
        }

        if (message === -1) {
          break;
        }

        const lengthEnd = raw.indexOf("~m~", message + 3);

        if (lengthEnd === -1) {
          break;
        }

        const length = Number.parseInt(raw.slice(message + 3, lengthEnd), 10);
        const payload = raw.slice(lengthEnd + 3, lengthEnd + 3 + length);
        cursor = lengthEnd + 3 + length;

        let packet: { m?: string; p?: unknown[] };

        try {
          packet = JSON.parse(payload);
        } catch {
          continue;
        }

        if (packet.m === "du" || packet.m === "timescale_update") {
          const prices = (packet.p?.[1] as
            | { $prices?: { s?: Array<{ v: TvBar }> } }
            | undefined)?.$prices;

          for (const point of prices?.s ?? []) {
            if (Array.isArray(point.v) && point.v.length >= 5) {
              byTime.set(point.v[0], point.v);
            }
          }
        } else if (packet.m === "series_completed") {
          finish();
        } else if (
          packet.m === "critical_error" ||
          packet.m === "symbol_error" ||
          packet.m === "series_error"
        ) {
          finish(
            new Error(
              `TradingView history error for ${symbol}: ${JSON.stringify(packet.p).slice(0, 200)}`,
            ),
          );
        }
      }
    };

    ws.onerror = () => {
      finish(new Error(`TradingView websocket error for ${symbol}`));
    };

    ws.onclose = () => {
      if (!settled) {
        finish(new Error(`TradingView websocket closed early for ${symbol}`));
      }
    };
  });
}
