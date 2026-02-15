import React, { useEffect, useMemo, useRef, useState } from "react";
import { Box, Text, useInput, useStdout } from "ink";
import type { ModuleRegistry } from "../boot/moduleRegistry";
import { DEFAULTS } from "../config/defaults";
import type { DummyTradeEngine } from "../modules/dummyTradeEngine";
import type { CommandDefinition } from "../types/commands";
import type { MetricsSnapshot } from "../types/events";
import type { ConnectionState, MarketTick } from "../types/market";
import type { OpenOrder } from "../types/order";
import type { PortfolioSnapshot } from "../types/portfolio";
import type { ReviewRequest } from "../types/review";
import { createSparkline } from "../utils/sparkline";
import { ActiveTradesPanel } from "./ActiveTradesPanel";
import { CommandPalette } from "./CommandPalette";
import { MarketPanel, type MarketRow } from "./MarketPanel";
import { PortfolioPanel } from "./PortfolioPanel";
import { ReviewModal } from "./ReviewModal";

interface AppProps {
  registry: ModuleRegistry;
  tradeEngine: DummyTradeEngine;
}

interface LogLine {
  level: "INFO" | "WARN" | "ERROR";
  message: string;
  ts: number;
}

const COMMANDS: CommandDefinition[] = [
  { id: "open", label: "Open Trade", command: "/open BTCUSD 0.01 market buy", description: "Open new trade" },
  { id: "close", label: "Close Position", command: "/close <orderId>", description: "Close by source order id" },
  { id: "portfolio", label: "Show Portfolio", command: "/portfolio", description: "Log portfolio summary" },
  { id: "start-bot", label: "Start Bot", command: "/start-bot", description: "Enable auto review generation" },
  { id: "stop-bot", label: "Stop Bot", command: "/stop-bot", description: "Disable auto review generation" },
  { id: "switch-strategy", label: "Switch Strategy", command: "/switch-strategy mean-reversion", description: "Change strategy" },
  { id: "review", label: "Trigger Review", command: "/review ETHUSD 0.02 sell", description: "Manual review request" }
];

function initialPortfolio(): PortfolioSnapshot {
  return {
    cashBalance: DEFAULTS.initialCash,
    equity: DEFAULTS.initialCash,
    marginUsed: 0,
    realizedPnl: 0,
    unrealizedPnl: 0,
    positions: [],
    updatedAt: Date.now()
  };
}

export function App({ registry, tradeEngine }: AppProps): React.JSX.Element {
  const { stdout } = useStdout();
  const contentWidth = Math.max(100, (stdout.columns ?? 120) - 1);
  const rowGap = 1;
  const topLeftWidth = Math.floor((contentWidth - rowGap) * 0.65);
  const topRightWidth = contentWidth - rowGap - topLeftWidth;
  const bottomLeftWidth = Math.floor((contentWidth - rowGap) * 0.5);
  const bottomRightWidth = contentWidth - rowGap - bottomLeftWidth;

  const [marketRows, setMarketRows] = useState<MarketRow[]>([]);
  const [portfolio, setPortfolio] = useState<PortfolioSnapshot>(initialPortfolio);
  const [metrics, setMetrics] = useState<MetricsSnapshot>({
    ticksPerSec: 0,
    orderCreated: 0,
    orderFilled: 0,
    commandP50Ms: 0,
    commandP99Ms: 0,
    updatedAt: Date.now()
  });
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");
  const [botRunning, setBotRunning] = useState(false);
  const [strategy, setStrategy] = useState<string>(DEFAULTS.defaultStrategy);
  const [commandOpen, setCommandOpen] = useState(false);
  const [reviewQueue, setReviewQueue] = useState<ReviewRequest[]>([]);

  const latestTicksRef = useRef(new Map<string, MarketTick>());
  const historyRef = useRef(new Map<string, number[]>());

  const rebuildMarketRows = useMemo(
    () => () => {
      const rows: MarketRow[] = [];
      for (const [instrument, tick] of latestTicksRef.current.entries()) {
        rows.push({
          instrument,
          price: tick.price,
          bid: tick.bid,
          ask: tick.ask,
          volume: tick.volume,
          sparkline: createSparkline(historyRef.current.get(instrument) ?? [], DEFAULTS.ui.sparklineWidth)
        });
      }
      rows.sort((a, b) => a.instrument.localeCompare(b.instrument));
      setMarketRows(rows);
    },
    []
  );

  useEffect(() => {
    const unsubs: Array<() => void> = [];
    unsubs.push(
      registry.on("market.tick", (tick) => {
        latestTicksRef.current.set(tick.instrument, tick);
        const history = historyRef.current.get(tick.instrument) ?? [];
        history.push(tick.price);
        if (history.length > 80) history.shift();
        historyRef.current.set(tick.instrument, history);
      })
    );
    unsubs.push(registry.on("portfolio.updated", setPortfolio));
    unsubs.push(registry.on("market.connection", (evt) => setConnectionState(evt.state)));
    unsubs.push(registry.on("review.requested", (req) => setReviewQueue((prev) => [...prev, req])));
    unsubs.push(registry.on("bot.state", (evt) => setBotRunning(evt.running)));
    unsubs.push(registry.on("strategy.changed", (evt) => setStrategy(evt.strategy)));
    unsubs.push(registry.on("metrics.updated", setMetrics));
    unsubs.push(
      registry.on("log", (line) => {
        setLogs((prev) => {
          const next = [...prev, line];
          return next.length > DEFAULTS.ui.logBuffer ? next.slice(next.length - DEFAULTS.ui.logBuffer) : next;
        });
      })
    );

    // Sampling window update instead of per-tick state updates.
    // This keeps render frequency bounded under sustained HFT tick throughput.
    const marketSampler = setInterval(rebuildMarketRows, DEFAULTS.ui.marketSampleMs);

    return () => {
      clearInterval(marketSampler);
      for (const unsub of unsubs) unsub();
    };
  }, [rebuildMarketRows, registry]);

  const activeReview = reviewQueue[0];

  useInput((input) => {
    if (activeReview || commandOpen) return;
    if (input === "/" || input === "\\") setCommandOpen(true);
  });

  const executeCommand = async (raw: string): Promise<void> => {
    const started = performance.now();
    const command = raw.trim();
    if (!command) return;
    const parts = command.startsWith("/") ? command.slice(1).split(/\s+/) : command.split(/\s+/);
    const action = parts[0]?.toLowerCase();

    try {
      if (action === "open") {
        const instrument = parts[1] ?? "BTCUSD";
        const quantity = Number(parts[2] ?? "0.01");
        const type = (parts[3] as OpenOrder["type"] | undefined) ?? "market";
        const side = (parts[4] as OpenOrder["side"] | undefined) ?? "buy";
        await tradeEngine.openTrade({ instrument, quantity, type, side, strategy, source: "manual" });
      } else if (action === "close") {
        const orderId = parts[1] ?? portfolio.positions.find((p) => p.status === "open")?.sourceOrderId;
        if (!orderId) throw new Error("No open order id available to close");
        await tradeEngine.closeTrade(orderId);
      } else if (action === "portfolio") {
        const snap = tradeEngine.getPortfolioSnapshot();
        registry.emit("log", {
          level: "INFO",
          ts: Date.now(),
          message: `Portfolio cash=${snap.cashBalance.toFixed(2)} eq=${snap.equity.toFixed(2)} uPnL=${snap.unrealizedPnl.toFixed(2)}`
        });
      } else if (action === "start-bot") {
        tradeEngine.setBotRunning(true);
      } else if (action === "stop-bot") {
        tradeEngine.setBotRunning(false);
      } else if (action === "switch-strategy") {
        tradeEngine.switchStrategy(parts[1] ?? "mean-reversion");
      } else if (action === "review") {
        tradeEngine.requestReview(
          {
            instrument: parts[1] ?? "BTCUSD",
            quantity: Number(parts[2] ?? "0.01"),
            side: (parts[3] as OpenOrder["side"] | undefined) ?? "buy",
            type: "market",
            strategy,
            source: "auto"
          },
          "Manual review command"
        );
      } else {
        registry.emit("log", { level: "WARN", ts: Date.now(), message: `Unknown command: ${command}` });
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown command error";
      registry.emit("log", { level: "ERROR", ts: Date.now(), message: msg });
    } finally {
      registry.emit("command.latency", { command, ms: performance.now() - started, ts: Date.now() });
    }
  };

  const approveReview = async (request: ReviewRequest): Promise<void> => {
    setReviewQueue((prev) => prev.slice(1));
    await tradeEngine.openTrade({ ...request.order, source: "review-approved" });
    registry.emit("log", { level: "INFO", ts: Date.now(), message: `Review approved ${request.id}` });
  };

  const rejectReview = (request: ReviewRequest): void => {
    setReviewQueue((prev) => prev.slice(1));
    registry.emit("log", { level: "WARN", ts: Date.now(), message: `Review rejected ${request.id}` });
  };

  return (
    <Box flexDirection="column" width={contentWidth}>
      <Text color="cyan">HFT Terminal | Strategy: {strategy} | Bot: {botRunning ? "ON" : "OFF"}</Text>
      <Text color="gray">
        Ticks/s: {metrics.ticksPerSec.toFixed(2)} | Orders: {metrics.orderCreated}/{metrics.orderFilled} | Cmd p50/p99: {metrics.commandP50Ms.toFixed(2)}/{metrics.commandP99Ms.toFixed(2)} ms
      </Text>

      <Box width={contentWidth}>
        <Box width={topLeftWidth} marginRight={rowGap}>
          <MarketPanel rows={marketRows} connectionState={connectionState} />
        </Box>
        <Box width={topRightWidth}>
          <ActiveTradesPanel positions={portfolio.positions} />
        </Box>
      </Box>

      <Box width={contentWidth}>
        <Box width={bottomLeftWidth} marginRight={rowGap}>
          <PortfolioPanel portfolio={portfolio} />
        </Box>
        <Box width={bottomRightWidth}>
          <Box borderStyle="round" borderColor="yellow" flexDirection="column" paddingX={1} minHeight={10}>
            <Text color="yellow">Logs</Text>
            {logs.slice(-8).map((line, idx) => (
              <Text key={`${line.ts}_${idx}`} color={line.level === "ERROR" ? "red" : line.level === "WARN" ? "yellow" : "white"}>
                [{new Date(line.ts).toISOString().slice(11, 19)}] {line.level} {line.message}
              </Text>
            ))}
          </Box>
        </Box>
      </Box>

      <CommandPalette
        isOpen={commandOpen}
        commands={COMMANDS}
        onClose={() => setCommandOpen(false)}
        onExecute={(cmd) => void executeCommand(cmd)}
      />

      <ReviewModal
        request={activeReview}
        onApprove={(req) => void approveReview(req)}
        onReject={rejectReview}
      />

      <Text color="gray">/ or \ open palette | y/n review | /open /close /portfolio /start-bot /stop-bot</Text>
    </Box>
  );
}
