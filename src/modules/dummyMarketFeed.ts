import type { ModuleRegistry } from "../boot/moduleRegistry";
import type { MarketTick } from "../types/market";
import type { SystemModule } from "../types/module";

interface DummyMarketFeedConfig {
  instruments: readonly string[];
  minTicksPerSecond: number;
  maxTicksPerSecond: number;
  frameMs: number;
}

export interface MarketSocketClient {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  onTick(handler: (tick: MarketTick) => void): () => void;
}

class DummyMarketSocketClient implements MarketSocketClient {
  private readonly handlers = new Set<(tick: MarketTick) => void>();

  async connect(): Promise<void> {
    return;
  }

  async disconnect(): Promise<void> {
    this.handlers.clear();
  }

  onTick(handler: (tick: MarketTick) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  push(tick: MarketTick): void {
    for (const handler of this.handlers) handler(tick);
  }
}

export class DummyMarketFeed implements SystemModule {
  private readonly client = new DummyMarketSocketClient();
  private readonly prices = new Map<string, number>();
  private timer?: ReturnType<typeof setInterval>;
  private running = false;

  constructor(
    private readonly registry: ModuleRegistry,
    private readonly config: DummyMarketFeedConfig
  ) {
    for (const instrument of config.instruments) {
      this.prices.set(instrument, 100 + Math.random() * 40_000);
    }

    this.client.onTick((tick) => this.registry.emit("market.tick", tick));

    // Real socket swap point:
    // const ws = new WebSocket("wss://exchange.example/feed");
    // ws.onmessage = (event) => { parse and emit market.tick };
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    this.registry.emit("market.connection", {
      source: "dummy",
      state: "connecting",
      ts: Date.now()
    });

    await this.client.connect();

    this.registry.emit("market.connection", {
      source: "dummy",
      state: "connected",
      ts: Date.now(),
      message: "Dummy feed connected"
    });

    this.registry.emit("log", {
      level: "INFO",
      ts: Date.now(),
      message: "Dummy market feed started"
    });

    this.timer = setInterval(() => {
      if (!this.running) return;

      const target = this.randInt(this.config.minTicksPerSecond, this.config.maxTicksPerSecond);
      const perFrame = Math.max(1, Math.floor((target * this.config.frameMs) / 1000));
      const burst = Math.random() > 0.9 ? this.randInt(5, 14) : 0;
      const count = perFrame + burst;

      for (let i = 0; i < count; i++) {
        this.client.push(this.nextTick());
      }
    }, this.config.frameMs);
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    await this.client.disconnect();

    this.registry.emit("market.connection", {
      source: "dummy",
      state: "disconnected",
      ts: Date.now(),
      message: "Dummy feed disconnected"
    });
  }

  private nextTick(): MarketTick {
    const instrument =
      this.config.instruments[this.randInt(0, this.config.instruments.length - 1)] ?? "BTCUSD";
    const prev = this.prices.get(instrument) ?? 100;
    const drift = (Math.random() - 0.5) * prev * 0.0013;
    const spike = Math.random() > 0.985 ? (Math.random() - 0.5) * prev * 0.01 : 0;
    const price = Math.max(0.0001, prev + drift + spike);
    this.prices.set(instrument, price);

    const spread = Math.max(0.01, price * 0.0002);
    return {
      instrument,
      price,
      bid: price - spread / 2,
      ask: price + spread / 2,
      volume: 0.1 + Math.random() * 5,
      ts: Date.now()
    };
  }

  private randInt(min: number, max: number): number {
    const lo = Math.ceil(min);
    const hi = Math.floor(max);
    return Math.floor(Math.random() * (hi - lo + 1)) + lo;
  }
}
