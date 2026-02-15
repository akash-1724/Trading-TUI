# HFT TUI System Working Guide

This document explains how the Bun + TypeScript + Ink trading TUI works end-to-end, including:

- how data flows through the system
- what each file does
- which libraries are used in each file
- where each file/module is used
- runtime behavior, performance strategy, and extension points

---

## 1) Runtime Architecture Overview

The application is a terminal control plane with an event-driven architecture:

1. `src/index.ts` bootstraps modules and mounts Ink UI.
2. `src/boot/moduleRegistry.ts` provides typed module registry + typed event bus.
3. Producer modules emit events:
   - `src/modules/dummyMarketFeed.ts` emits high-frequency `market.tick`.
   - `src/modules/dummyTradeEngine.ts` emits order and portfolio events.
4. Observer/utility modules consume events:
   - `src/modules/metricsModule.ts` computes throughput/latency stats.
   - `src/modules/eventJournal.ts` persists selected events to NDJSON.
5. `src/ui/App.tsx` subscribes to events, samples/aggregates state, and renders panels.

### Core design goals implemented

- **Typed event path**: no `any` in core event flow.
- **Non-blocking UI**: market updates are sampled on interval, not re-rendered per tick.
- **Non-blocking engine path**: order fills simulated asynchronously (10–50ms timers).
- **Modular lifecycle**: modules can be registered/unregistered/stopped via registry.

---

## 2) Boot Sequence and Control Flow

### Startup sequence (`src/index.ts`)

1. Ensures `data/` directory exists.
2. Constructs one `ModuleRegistry` instance.
3. Creates module instances:
   - `DummyTradeEngine`
   - `DummyMarketFeed`
   - `MetricsModule`
   - `EventJournal`
4. Registers modules in registry (`register(name, module)`).
5. Mounts Ink app (`render(...)`) early so initial events are visible in UI.
6. Starts modules (`start()`).
7. On `SIGINT`/`SIGTERM`: emits shutdown log, stops modules via `stopAll()`, unmounts Ink.

### Runtime event flow

- Feed emits `market.tick` → UI updates sampled market table/sparklines.
- Trade engine listens to `market.tick` for mark-to-market PnL updates.
- Command execution in UI calls trade engine methods:
  - `openTrade(order)`
  - `closeTrade(orderId)`
- Trade engine emits:
  - `order.created`
  - `order.filled`
  - `portfolio.updated`
  - `review.requested` (bot/review flow)
- Metrics module listens and emits `metrics.updated` every second.
- Journal module buffers selected events and flushes to `data/events.ndjson`.

---

## 3) File-by-File Details

## Root files

### `package.json`

**Purpose**
- Project metadata, dependencies, and Bun scripts.

**Libraries referenced**
- Runtime: `ink`, `react`
- Dev: `typescript`, `@types/react`, `@types/bun`

**Scripts**
- `start`: `bun run src/index.ts`
- `dev`: `bash scripts/dev.sh`
- `typecheck`: `bunx tsc --noEmit`
- `bench`: `bun run scripts/bench.ts`

**Used by**
- Bun CLI (`bun run ...`) and package resolution.

---

### `tsconfig.json`

**Purpose**
- Strict TS configuration.

**Key options**
- `strict: true`
- `jsx: react-jsx`
- `moduleResolution: Bundler`
- `types: ["bun", "react"]`

**Used by**
- `bun run typecheck`.

---

### `.gitignore`

**Purpose**
- Ignore generated/host-specific artifacts (`node_modules`, logs, `data/`, etc.).

---

### `README.md`

**Purpose**
- Setup, run steps, command/key bindings, security and production notes.

---

### `SYSTEM_WORKING_GUIDE.md`

**Purpose**
- This deep-dive documentation file.

---

## Source files

### `src/index.ts`

**Purpose**
- Main entrypoint. Bootstraps registry/modules and mounts UI.

**Libraries used**
- `react`: create element for Ink render.
- `ink`: `render` for TUI mount.
- `node:fs/promises`: `mkdir` for `data/`.

**Depends on**
- `src/boot/moduleRegistry.ts`
- `src/config/defaults.ts`
- `src/modules/*`
- `src/ui/App.tsx`

**Used by**
- `bun run start`.

---

### `src/boot/moduleRegistry.ts`

**Purpose**
- Typed module registry and typed event bus implementation.

**Main APIs**
- `register(name, module)`
- `unregister(name)`
- `get(name)`
- `emit(event, payload)`
- `on(event, handler)`
- `off(event, handler)`
- `stopAll()`

**Libraries used**
- No external library; TypeScript types only.

**Used by**
- All modules and UI for pub/sub.

---

### `src/config/defaults.ts`

**Purpose**
- Central runtime constants for feed rates, risk limits, UI sampling, metrics window, journal path.

**Used by**
- `src/index.ts`, `src/ui/App.tsx`.

---

## `src/types/*`

These files define all DTOs/events/contracts used system-wide.

### `src/types/market.ts`
- Defines `MarketTick`, connection state events.

### `src/types/order.ts`
- Defines `OrderSide`, `OrderType`, `OpenOrder`, `OrderReceipt`, `OrderFill`.

### `src/types/portfolio.ts`
- Defines `Position`, `PortfolioSnapshot`.

### `src/types/review.ts`
- Defines `ReviewRequest`.

### `src/types/commands.ts`
- Defines `CommandDefinition` used by command palette.

### `src/types/events.ts`
- Defines global `EventMap` and event payload types.
- Includes metrics and command latency events.

### `src/types/module.ts`
- Defines `TypedEventBus` and `SystemModule` interfaces.

**Used by**
- Core registry, modules, and UI components.

---

## Modules

### `src/modules/dummyMarketFeed.ts`

**Purpose**
- Simulates bursty market feed at high aggregate rate.

**Behavior**
- Maintains per-instrument seed prices.
- On each frame (`frameMs`):
  - chooses target ticks/sec range
  - emits base ticks + occasional burst ticks
- Adds drift and occasional spikes to mimic micro-structure noise.

**Libraries used**
- No external library; uses timers and typed contracts.

**Public abstraction**
- `MarketSocketClient` interface + dummy implementation.
- Includes comment showing where real Bun WebSocket integration can be swapped in.

**Events emitted**
- `market.connection`
- `market.tick`
- `log`

**Used by**
- Started in `src/index.ts`; consumed by trade engine/UI/metrics/journal.

---

### `src/modules/dummyTradeEngine.ts`

**Purpose**
- Simulated trade execution and in-memory portfolio accounting.

**Key methods**
- `openTrade(order: OpenOrder): Promise<OrderReceipt>`
- `closeTrade(orderId: string): Promise<OrderReceipt>`
- `setBotRunning(boolean)`
- `switchStrategy(strategy)`
- `requestReview(order, reason)`
- `getPortfolioSnapshot()`

**Risk controls implemented**
- max order qty
- max order notional (if market price available)
- max open positions

**Performance and async behavior**
- Fill latency simulated with non-blocking `setTimeout(10–50ms)`.
- Portfolio updates from ticks are debounced before UI emission.

**Events emitted**
- `order.created`
- `order.filled`
- `portfolio.updated`
- `review.requested`
- `bot.state`
- `strategy.changed`
- `log`

**Events consumed**
- `market.tick` for mark-to-market updates.

**Used by**
- Created in `src/index.ts`, controlled via commands in `src/ui/App.tsx`.

---

### `src/modules/metricsModule.ts`

**Purpose**
- Computes runtime observability metrics in-memory.

**Tracks**
- Tick rate over rolling window (`ticksPerSec`).
- Counts for created/filled orders.
- Command latency distribution (p50/p99).

**Events consumed**
- `market.tick`
- `order.created`
- `order.filled`
- `command.latency`

**Events emitted**
- `metrics.updated`

**Used by**
- Started in `src/index.ts`; displayed in `src/ui/App.tsx`.

---

### `src/modules/eventJournal.ts`

**Purpose**
- Buffers key events and persists to local NDJSON journal.

**Storage**
- Path: `data/events.ndjson`

**Events captured**
- `market.tick`
- `order.created`
- `order.filled`
- `portfolio.updated`
- `review.requested`
- `log`

**Libraries used**
- Bun file APIs (`Bun.file`, `Bun.write`).

**Used by**
- Started in `src/index.ts`.

---

## UI files

### `src/ui/App.tsx`

**Purpose**
- Root UI composition, subscriptions, command parsing/execution, and overlays.

**Libraries used**
- `react`: state/effects/memo/refs.
- `ink`: layout (`Box`, `Text`), keyboard input (`useInput`), terminal size (`useStdout`).

**Renders**
- top: `MarketPanel` + `ActiveTradesPanel`
- bottom: `PortfolioPanel` + Logs panel
- overlay: `CommandPalette`, `ReviewModal`

**Events consumed**
- `market.tick`, `portfolio.updated`, `market.connection`, `review.requested`, `bot.state`, `strategy.changed`, `metrics.updated`, `log`

**Events emitted**
- `log` (for command results/errors)
- `command.latency`

**Performance strategy**
- Uses refs for high-frequency tick storage.
- Rebuilds market rows on fixed sampling interval (`marketSampleMs`) instead of per tick.

---

### `src/ui/CommandPalette.tsx`

**Purpose**
- Searchable command overlay with keyboard navigation.

**Libraries used**
- `react`: local state/memo/effect.
- `ink`: keyboard handling and render.

**Keys handled**
- `Esc`: close
- `ArrowUp/ArrowDown`: navigate
- `Enter`: execute
- text input + backspace/delete

**Used by**
- Mounted in `src/ui/App.tsx`.

---

### `src/ui/MarketPanel.tsx`

**Purpose**
- Shows instrument rows with price, bid/ask, volume, sparkline.

**Libraries used**
- `ink` for layout/text.

**Used by**
- `src/ui/App.tsx`.

---

### `src/ui/ActiveTradesPanel.tsx`

**Purpose**
- Lists open positions/trades.

**Libraries used**
- `ink`.

**Used by**
- `src/ui/App.tsx`.

---

### `src/ui/PortfolioPanel.tsx`

**Purpose**
- Shows balances, PnL, margin, open position count.

**Libraries used**
- `ink`.

**Used by**
- `src/ui/App.tsx`.

---

### `src/ui/ReviewModal.tsx`

**Purpose**
- Human-in-the-loop approval UI for auto-generated review requests.

**Libraries used**
- `ink` input handling for `y`/`n`.

**Used by**
- `src/ui/App.tsx`.

---

## Utility files

### `src/utils/debounce.ts`

**Purpose**
- Generic typed debounce helper.

**Used by**
- `src/modules/dummyTradeEngine.ts` for portfolio update throttling.

---

### `src/utils/sparkline.ts`

**Purpose**
- Converts numeric series into compact ASCII sparkline.

**Used by**
- `src/ui/App.tsx` when building market rows for `MarketPanel`.

---

## Scripts

### `scripts/dev.sh`

**Purpose**
- Dev loop with Bun watch mode.

**Used by**
- `bun run dev`.

---

### `scripts/bench.ts`

**Purpose**
- Synthetic feed benchmark to estimate processing throughput.

**Behavior**
- Starts dummy feed at elevated rate.
- Counts ticks for fixed duration.
- Prints approximate ticks/sec.

**Used by**
- `bun run bench`.

---

## 4) External Libraries and Exactly Where They Are Used

### `ink`

Used in:
- `src/index.ts` (`render`)
- `src/ui/App.tsx` (`Box`, `Text`, `useInput`, `useStdout`)
- `src/ui/CommandPalette.tsx` (`Box`, `Text`, `useInput`)
- `src/ui/MarketPanel.tsx` (`Box`, `Text`)
- `src/ui/ActiveTradesPanel.tsx` (`Box`, `Text`)
- `src/ui/PortfolioPanel.tsx` (`Box`, `Text`)
- `src/ui/ReviewModal.tsx` (`Box`, `Text`, `useInput`)

Purpose:
- Terminal UI rendering, layout composition, keyboard input.

### `react`

Used in:
- `src/index.ts` (element creation for Ink mount)
- all `src/ui/*.tsx` files for component/state/effect model

Purpose:
- declarative component model for TUI.

### `typescript`

Used globally via compile-time typing:
- all `src/**/*.ts` and `src/**/*.tsx`

Purpose:
- strict types across event bus, DTOs, modules, and UI.

### Bun runtime APIs

Used in:
- `src/modules/eventJournal.ts`: `Bun.file`, `Bun.write`

Purpose:
- runtime I/O and file persistence with Bun.

---

## 5) Command System Details

Commands are parsed in `src/ui/App.tsx` by `executeCommand(raw)`.

Supported commands:
- `/open <instrument> <qty> <market|limit> <buy|sell>`
- `/close <orderId>` (or first open position if omitted)
- `/portfolio`
- `/start-bot`
- `/stop-bot`
- `/switch-strategy <name>`
- `/review <instrument> <qty> <buy|sell>`

Command latency is measured and emitted as `command.latency` for p50/p99 metrics.

---

## 6) Review (Human-in-the-loop) Flow

1. Bot mode (`/start-bot`) periodically creates proposed orders.
2. Trade engine emits `review.requested` instead of executing immediately.
3. UI queue (`reviewQueue`) shows top request in `ReviewModal`.
4. Press:
   - `y`: approve -> calls `openTrade` with source `review-approved`
   - `n`: reject -> logs rejection, drops request

---

## 7) Data Persistence and Logs

### In-memory state
- Latest tick per instrument + price history (UI refs)
- Portfolio positions and balances (trade engine)
- Metrics counters/windows (metrics module)

### Disk state
- Event journal: `data/events.ndjson`

### Log panel
- Populated from `log` event stream in App.
- Color coding:
  - `INFO` white
  - `WARN` yellow
  - `ERROR` red

---

## 8) Performance Strategy and Guardrails

- **No per-tick UI setState** in market view.
- Tick ingestion goes to refs; UI publishes on fixed sample interval.
- Module event dispatch uses microtask scheduling in registry (`queueMicrotask`).
- Order fill simulation is asynchronous (`setTimeout`), so command path returns quickly.
- Portfolio updates from mark-to-market are debounced.

Potential tuning knobs (in `src/config/defaults.ts`):
- `feed.minTicksPerSecond`, `feed.maxTicksPerSecond`, `feed.frameMs`
- `ui.marketSampleMs`
- `metrics.windowSec`, `metrics.publishMs`
- `risk.*`

---

## 9) Security and Production Caveats

- No real exchange auth/signing is implemented in this scaffold.
- Never hard-code API keys.
- Add robust:
  - key management
  - nonce/signature logic
  - rate-limit handling/backoff
  - circuit breakers/kill switches
  - audit-grade persistence and replay

Recommended before production:
- run paper/sandbox first
- configure process priority / CPU affinity at OS level
- add structured telemetry export

---

## 10) “Where Is This Used?” Quick Index

- Registry class: `src/boot/moduleRegistry.ts` -> used by every module and UI root.
- Feed module: `src/modules/dummyMarketFeed.ts` -> started in `src/index.ts`.
- Trade engine: `src/modules/dummyTradeEngine.ts` -> started in `src/index.ts`, commanded by `src/ui/App.tsx`.
- Metrics module: `src/modules/metricsModule.ts` -> started in `src/index.ts`, rendered in `src/ui/App.tsx`.
- Journal module: `src/modules/eventJournal.ts` -> started in `src/index.ts`.
- App root: `src/ui/App.tsx` -> mounted from `src/index.ts`.
- Panels/modal/palette: all imported by `src/ui/App.tsx`.
- Sparkline helper: `src/utils/sparkline.ts` -> used in `src/ui/App.tsx`.
- Debounce helper: `src/utils/debounce.ts` -> used in `src/modules/dummyTradeEngine.ts`.

---

## 11) Current Known Limitations

- Dummy feed and trade execution only (no real exchange connectivity yet).
- Journal writes are simple append-cycle and not optimized for very large sustained throughput.
- No historical replay engine in UI yet.
- No auth, no persistence DB, no distributed deployment model in V1.

---

If you want, next we can add a second doc: `EVENT_CATALOG.md` with every event schema + producer/consumer mapping + latency expectations.
