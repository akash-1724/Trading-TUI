# Event Catalog

This file documents all runtime events in the system, their payloads, producers, consumers, and latency expectations.

Source of truth type map: `src/types/events.ts` (`EventMap`).

---

## Conventions

- Transport: in-process typed event bus (`ModuleRegistry.emit/on/off`)
- Dispatch model: microtask fan-out (`queueMicrotask`) in `src/boot/moduleRegistry.ts`
- Timestamps: epoch milliseconds (`number`)

---

## `market.tick`

**Type**: `MarketTick` (`src/types/market.ts`)

```ts
interface MarketTick {
  instrument: string;
  price: number;
  bid: number;
  ask: number;
  volume?: number;
  ts: number;
}
```

**Produced by**
- `src/modules/dummyMarketFeed.ts`

**Consumed by**
- `src/ui/App.tsx` (ingest refs + sampled market render)
- `src/modules/dummyTradeEngine.ts` (mark-to-market updates)
- `src/modules/metricsModule.ts` (tick-rate stats)
- `src/modules/eventJournal.ts` (optional persistence)

**Frequency**
- Default aggregate 50-200 ticks/sec, bursty.

**Latency expectation**
- Producer to consumers: sub-millisecond to a few milliseconds in-process.

---

## `market.connection`

**Type**: `MarketConnectionEvent` (`src/types/market.ts`)

```ts
interface MarketConnectionEvent {
  source: "dummy" | "exchange";
  state: "connecting" | "connected" | "disconnected" | "reconnecting";
  ts: number;
  message?: string;
}
```

**Produced by**
- `src/modules/dummyMarketFeed.ts`

**Consumed by**
- `src/ui/App.tsx` (connection badge/status)

---

## `order.created`

**Type**: `OrderReceipt` (`src/types/order.ts`)

```ts
interface OrderReceipt {
  orderId: string;
  instrument: string;
  quantity: number;
  side: "buy" | "sell";
  type: "market" | "limit";
  status: "accepted" | "rejected" | "filled" | "cancelled";
  createdAt: number;
  strategy: string;
}
```

**Produced by**
- `src/modules/dummyTradeEngine.ts` (`openTrade`)

**Consumed by**
- `src/modules/metricsModule.ts` (counter)
- `src/modules/eventJournal.ts` (persistence)

---

## `order.filled`

**Type**: `OrderFill` (`src/types/order.ts`)

```ts
interface OrderFill {
  orderId: string;
  instrument: string;
  quantity: number;
  side: "buy" | "sell";
  fillPrice: number;
  fee: number;
  latencyMs: number;
  filledAt: number;
}
```

**Produced by**
- `src/modules/dummyTradeEngine.ts` (async fill timer)

**Consumed by**
- `src/modules/metricsModule.ts` (counter)
- `src/modules/eventJournal.ts` (persistence)

**Latency expectation**
- Simulated fill latency: 10-50ms (config in engine logic).

---

## `portfolio.updated`

**Type**: `PortfolioSnapshot` (`src/types/portfolio.ts`)

```ts
interface PortfolioSnapshot {
  cashBalance: number;
  equity: number;
  marginUsed: number;
  realizedPnl: number;
  unrealizedPnl: number;
  positions: Position[];
  updatedAt: number;
}
```

**Produced by**
- `src/modules/dummyTradeEngine.ts`

**Consumed by**
- `src/ui/App.tsx` / `src/ui/PortfolioPanel.tsx` / `src/ui/ActiveTradesPanel.tsx`
- `src/modules/eventJournal.ts`

**Emission behavior**
- Immediate on fills.
- Debounced during mark-to-market updates from market ticks.

---

## `review.requested`

**Type**: `ReviewRequest` (`src/types/review.ts`)

```ts
interface ReviewRequest {
  id: string;
  order: OpenOrder;
  reason: string;
  confidence: number;
  createdAt: number;
}
```

**Produced by**
- `src/modules/dummyTradeEngine.ts`
  - bot auto mode
  - manual `/review` command path

**Consumed by**
- `src/ui/App.tsx` (review queue)
- `src/ui/ReviewModal.tsx` (display and y/n action)
- `src/modules/eventJournal.ts`

---

## `bot.state`

**Type**

```ts
interface BotStateEvent {
  running: boolean;
  ts: number;
}
```

**Produced by**
- `src/modules/dummyTradeEngine.ts` (`setBotRunning`)

**Consumed by**
- `src/ui/App.tsx` (header state)

---

## `strategy.changed`

**Type**

```ts
interface StrategyChangedEvent {
  strategy: string;
  ts: number;
}
```

**Produced by**
- `src/modules/dummyTradeEngine.ts` (startup + command switch)

**Consumed by**
- `src/ui/App.tsx` (header)

---

## `metrics.updated`

**Type**

```ts
interface MetricsSnapshot {
  ticksPerSec: number;
  orderCreated: number;
  orderFilled: number;
  commandP50Ms: number;
  commandP99Ms: number;
  updatedAt: number;
}
```

**Produced by**
- `src/modules/metricsModule.ts` (periodic publish)

**Consumed by**
- `src/ui/App.tsx` (top-line runtime metrics)

---

## `command.latency`

**Type**

```ts
{ command: string; ms: number; ts: number }
```

**Produced by**
- `src/ui/App.tsx` (around command execution path)

**Consumed by**
- `src/modules/metricsModule.ts`

---

## `log`

**Type**: `LogEvent`

```ts
interface LogEvent {
  level: "INFO" | "WARN" | "ERROR";
  message: string;
  ts: number;
}
```

**Produced by**
- `src/modules/dummyMarketFeed.ts`
- `src/modules/dummyTradeEngine.ts`
- `src/ui/App.tsx` (command and UX logs)
- `src/index.ts` (shutdown)

**Consumed by**
- `src/ui/App.tsx` (log panel)
- `src/modules/eventJournal.ts`

---

## Producer/Consumer Matrix (Quick View)

| Event | Producer(s) | Main Consumer(s) |
|---|---|---|
| `market.tick` | DummyMarketFeed | App, TradeEngine, Metrics, Journal |
| `market.connection` | DummyMarketFeed | App |
| `order.created` | DummyTradeEngine | Metrics, Journal |
| `order.filled` | DummyTradeEngine | Metrics, Journal |
| `portfolio.updated` | DummyTradeEngine | App, Journal |
| `review.requested` | DummyTradeEngine | App/ReviewModal, Journal |
| `bot.state` | DummyTradeEngine | App |
| `strategy.changed` | DummyTradeEngine | App |
| `metrics.updated` | MetricsModule | App |
| `command.latency` | App | MetricsModule |
| `log` | Feed/Engine/App/Index | App, Journal |

---

## Extension Notes

- Adding a new event:
  1. Add payload type + key in `src/types/events.ts`.
  2. Emit via `registry.emit(...)` in producer.
  3. Subscribe via `registry.on(...)` in consumer.
- Since bus is typed, invalid payloads fail at compile time.
