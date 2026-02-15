# HFT Terminal Control Plane (Ink + Bun)

Primary UI implementation: **Ink** (React for CLI).  
Runtime: **Bun**. Language: **TypeScript (strict mode)**.

This project is an event-driven terminal control plane scaffold for automated trading.

## What is implemented

- Typed module registry + event bus (`register`, `unregister`, `get`, `emit`, `on`, `off`)
- High-frequency dummy market feed with micro-bursts (50-200 ticks/sec aggregate)
- Dummy trade engine with:
  - `openTrade(order: OpenOrder)`
  - `closeTrade(orderId: string)`
  - in-memory portfolio accounting
  - emitted events: `order.created`, `order.filled`, `portfolio.updated`, `review.requested`
- Ink TUI panels:
  - Market + sparkline
  - Active trades
  - Portfolio
  - Logs
  - Command palette (`/` or `\`, arrows, Enter, Esc)
  - Review modal (`y`/`n`)
- Additional completed steps:
  - Basic risk controls (max order qty/notional/open positions)
  - Local event journal persistence (`data/events.ndjson`)
  - Runtime metrics panel + event counters
  - Synthetic benchmark command (`bun run bench`)

## Bun install

```bash
curl -fsSL https://bun.sh/install | bash
```

Verify:

```bash
bun --version
```

## Run steps

1. Install dependencies:

```bash
bun install
```

2. Start the TUI:

```bash
bun run start
```

3. Optional dev watch mode:

```bash
bun run dev
```

4. Optional type-check:

```bash
bun run typecheck
```

5. Optional synthetic throughput benchmark:

```bash
bun run bench
```

## Key bindings

- `/` or `\` -> open command palette
- `Esc` -> close command palette
- `ArrowUp` / `ArrowDown` -> navigate command suggestions
- `Enter` -> execute selected/current command
- `y` / `n` -> approve/reject active review request

## Example commands

- `/open BTCUSD 0.01 market buy`
- `/close <orderId>`
- `/portfolio`
- `/start-bot`
- `/stop-bot`
- `/switch-strategy mean-reversion`
- `/review ETHUSD 0.02 sell`

## Security and production notes

- **Never store API keys in source code, repo history, or plaintext files.**
- Use environment or secret manager injection for keys and signing credentials.
- Add robust exchange rate-limit handling/retry/backoff/circuit-breakers before live deployment.
- Start with paper/sandbox accounts only.
- For production latency tuning, consider process priority and CPU affinity at OS level (recommendation only).
