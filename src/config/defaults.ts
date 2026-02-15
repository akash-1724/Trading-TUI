export const DEFAULTS = {
  instruments: ["BTCUSD", "ETHUSD", "SOLUSD", "AAPL"],
  initialCash: 100_000,
  defaultStrategy: "mean-reversion",
  feed: {
    minTicksPerSecond: 50,
    maxTicksPerSecond: 200,
    frameMs: 50
  },
  risk: {
    maxOrderQty: 2,
    maxOrderNotional: 50_000,
    maxOpenPositions: 20
  },
  ui: {
    marketSampleMs: 100,
    logBuffer: 250,
    sparklineWidth: 24
  },
  metrics: {
    windowSec: 30,
    publishMs: 1000
  },
  journal: {
    enabled: true,
    path: "data/events.ndjson",
    flushMs: 1000
  }
} as const;
