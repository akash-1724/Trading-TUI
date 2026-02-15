import React from "react";
import { mkdir } from "node:fs/promises";
import { render } from "ink";
import { ModuleRegistry } from "./boot/moduleRegistry";
import { DEFAULTS } from "./config/defaults";
import { DummyMarketFeed } from "./modules/dummyMarketFeed";
import { DummyTradeEngine } from "./modules/dummyTradeEngine";
import { EventJournal } from "./modules/eventJournal";
import { MetricsModule } from "./modules/metricsModule";
import { App } from "./ui/App";

async function bootstrap(): Promise<void> {
  await mkdir("data", { recursive: true });

  const registry = new ModuleRegistry();

  const tradeEngine = new DummyTradeEngine(registry, {
    initialCash: DEFAULTS.initialCash,
    defaultStrategy: DEFAULTS.defaultStrategy,
    risk: DEFAULTS.risk
  });

  const marketFeed = new DummyMarketFeed(registry, {
    instruments: DEFAULTS.instruments,
    minTicksPerSecond: DEFAULTS.feed.minTicksPerSecond,
    maxTicksPerSecond: DEFAULTS.feed.maxTicksPerSecond,
    frameMs: DEFAULTS.feed.frameMs
  });

  const metrics = new MetricsModule(registry, {
    windowSec: DEFAULTS.metrics.windowSec,
    publishMs: DEFAULTS.metrics.publishMs
  });

  const journal = new EventJournal(registry, {
    enabled: DEFAULTS.journal.enabled,
    path: DEFAULTS.journal.path,
    flushMs: DEFAULTS.journal.flushMs
  });

  registry.register("tradeEngine", tradeEngine);
  registry.register("marketFeed", marketFeed);
  registry.register("metrics", metrics);
  registry.register("journal", journal);

  const ink = render(React.createElement(App, { registry, tradeEngine }));

  await tradeEngine.start();
  await marketFeed.start();
  await metrics.start();
  await journal.start();

  const shutdown = async (): Promise<void> => {
    registry.emit("log", { level: "INFO", ts: Date.now(), message: "Shutting down..." });
    await registry.stopAll();
    ink.unmount();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

void bootstrap();
