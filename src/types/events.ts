import type { MarketConnectionEvent, MarketTick } from "./market";
import type { OrderFill, OrderReceipt } from "./order";
import type { PortfolioSnapshot } from "./portfolio";
import type { ReviewRequest } from "./review";

export type LogLevel = "INFO" | "WARN" | "ERROR";

export interface LogEvent {
  level: LogLevel;
  message: string;
  ts: number;
}

export interface BotStateEvent {
  running: boolean;
  ts: number;
}

export interface StrategyChangedEvent {
  strategy: string;
  ts: number;
}

export interface MetricsSnapshot {
  ticksPerSec: number;
  orderCreated: number;
  orderFilled: number;
  commandP50Ms: number;
  commandP99Ms: number;
  updatedAt: number;
}

export interface EventMap {
  "market.tick": MarketTick;
  "market.connection": MarketConnectionEvent;
  "order.created": OrderReceipt;
  "order.filled": OrderFill;
  "portfolio.updated": PortfolioSnapshot;
  "review.requested": ReviewRequest;
  "bot.state": BotStateEvent;
  "strategy.changed": StrategyChangedEvent;
  "metrics.updated": MetricsSnapshot;
  "command.latency": { command: string; ms: number; ts: number };
  log: LogEvent;
}

export type EventKey = keyof EventMap;
