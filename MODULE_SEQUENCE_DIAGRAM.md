# Module Sequence Diagrams

This file provides text sequence diagrams for major runtime flows.

Legend:
- `->` synchronous call
- `~>` async/event emission
- `[timer]` delayed callback

---

## 1) Startup Sequence

```
User
  -> Bun runtime (`bun run start`)
  -> src/index.ts bootstrap()

src/index.ts
  -> create data directory
  -> create ModuleRegistry
  -> construct modules (TradeEngine, MarketFeed, Metrics, Journal)
  -> registry.register(...) for each module
  -> Ink render(App)
  -> start TradeEngine
  -> start MarketFeed
  -> start Metrics
  -> start Journal

DummyMarketFeed
  ~> emit market.connection(connecting)
  -> connect socket abstraction
  ~> emit market.connection(connected)

App
  ~> receives connection + other events and renders panels
```

---

## 2) Market Tick Ingestion and UI Sampling

```
DummyMarketFeed [frame timer]
  -> generate N ticks (base + optional burst)
  ~> emit market.tick for each tick

ModuleRegistry
  ~> dispatch to subscribers via microtasks

App (market.tick handler)
  -> store latest tick in Map ref
  -> append price history in Map ref
  (no immediate setState per tick)

App [sampling interval every marketSampleMs]
  -> rebuild compact market rows from refs
  -> setState(marketRows)
  -> MarketPanel rerender

DummyTradeEngine (market.tick handler)
  -> update mark prices and unrealized PnL
  -> debounce portfolio.updated emission
```

---

## 3) Command to Open Trade to Fill

```
User keyboard
  -> App useInput opens CommandPalette with '/'

User enters command '/open BTCUSD 0.01 market buy'
  -> CommandPalette onExecute
  -> App executeCommand()
  -> start latency timer
  -> tradeEngine.openTrade(order)

DummyTradeEngine.openTrade
  -> risk checks
  -> build OrderReceipt
  ~> emit order.created
  -> [timer 10-50ms] schedule fill
  <- return Promise<OrderReceipt>

App executeCommand finally
  ~> emit command.latency

DummyTradeEngine [fill timer callback]
  -> compute fill price/fee
  -> mutate cash + positions
  ~> emit order.filled
  ~> emit portfolio.updated

App
  ~> receives portfolio.updated
  -> rerender Portfolio + ActiveTrades panels

MetricsModule
  ~> receives order.created/order.filled/command.latency
  -> updates counters/latency distribution
```

---

## 4) Close Trade Flow

```
User command '/close <orderId>'
  -> App executeCommand
  -> tradeEngine.closeTrade(orderId)

DummyTradeEngine.closeTrade
  -> locate open position by source order id
  -> build inverse market order (buy/sell)
  -> calls openTrade(closeOrder)
  -> map close order id -> target position id

DummyTradeEngine [fill timer]
  -> if close-mapped order:
     - compute realized PnL against entry
     - mark position closed
     - emit order.filled + portfolio.updated
```

---

## 5) Human-in-the-loop Review Flow

```
User '/start-bot'
  -> App executeCommand
  -> tradeEngine.setBotRunning(true)
  ~> emit bot.state(running=true)

DummyTradeEngine [review timer every ~2.5s]
  -> create proposed OpenOrder
  -> build ReviewRequest
  ~> emit review.requested

App
  -> push request into reviewQueue
  -> ReviewModal displays current request

User presses 'y'
  -> ReviewModal onApprove
  -> App approveReview
  -> tradeEngine.openTrade({...source:'review-approved'})

User presses 'n'
  -> ReviewModal onReject
  -> App logs rejection and dequeues request
```

---

## 6) Metrics Publish Loop

```
MetricsModule subscribers
  <- market.tick timestamps
  <- order.created count
  <- order.filled count
  <- command.latency values

MetricsModule [publish timer every publishMs]
  -> trim rolling tick window
  -> compute ticks/sec
  -> compute command p50/p99
  ~> emit metrics.updated

App
  <- metrics.updated
  -> update header metrics line
```

---

## 7) Journal Flush Loop

```
EventJournal subscribers
  <- selected events (tick/order/portfolio/review/log)
  -> append to memory buffer

EventJournal [flush timer every flushMs]
  -> serialize buffered rows as NDJSON
  -> write/append to data/events.ndjson

Shutdown path
  -> EventJournal.stop()
  -> final flush
```

---

## 8) Shutdown Sequence

```
OS signal (SIGINT/SIGTERM)
  -> index.ts shutdown()
  ~> emit log("Shutting down...")
  -> registry.stopAll()
      -> MarketFeed.stop()
      -> TradeEngine.stop()
      -> Metrics.stop()
      -> Journal.stop() [final flush]
  -> Ink unmount
  -> process.exit(0)
```

---

## 9) File Participation by Sequence

- Startup/shutdown: `src/index.ts`, `src/boot/moduleRegistry.ts`
- Tick flow: `src/modules/dummyMarketFeed.ts`, `src/ui/App.tsx`, `src/modules/dummyTradeEngine.ts`, `src/modules/metricsModule.ts`
- Command flow: `src/ui/CommandPalette.tsx`, `src/ui/App.tsx`, `src/modules/dummyTradeEngine.ts`
- Review flow: `src/modules/dummyTradeEngine.ts`, `src/ui/ReviewModal.tsx`, `src/ui/App.tsx`
- Persistence: `src/modules/eventJournal.ts`
- Rendering panels: `src/ui/MarketPanel.tsx`, `src/ui/ActiveTradesPanel.tsx`, `src/ui/PortfolioPanel.tsx`
