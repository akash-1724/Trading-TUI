import type { ModuleRegistry } from "../boot/moduleRegistry";
import type { MetricsSnapshot } from "../types/events";
import type { SystemModule } from "../types/module";

interface MetricsConfig {
  windowSec: number;
  publishMs: number;
}

export class MetricsModule implements SystemModule {
  private unsubs: Array<() => void> = [];
  private publishTimer?: ReturnType<typeof setInterval>;

  private tickTimes: number[] = [];
  private commandLatencies: number[] = [];
  private orderCreated = 0;
  private orderFilled = 0;

  constructor(
    private readonly registry: ModuleRegistry,
    private readonly config: MetricsConfig
  ) {}

  start(): void {
    this.unsubs.push(
      this.registry.on("market.tick", (tick) => {
        this.tickTimes.push(tick.ts);
      })
    );

    this.unsubs.push(
      this.registry.on("order.created", () => {
        this.orderCreated += 1;
      })
    );

    this.unsubs.push(
      this.registry.on("order.filled", () => {
        this.orderFilled += 1;
      })
    );

    this.unsubs.push(
      this.registry.on("command.latency", (evt) => {
        this.commandLatencies.push(evt.ms);
      })
    );

    this.publishTimer = setInterval(() => this.publish(), this.config.publishMs);
  }

  stop(): void {
    if (this.publishTimer) clearInterval(this.publishTimer);
    this.publishTimer = undefined;
    for (const unsub of this.unsubs) unsub();
    this.unsubs = [];
  }

  private publish(): void {
    const now = Date.now();
    const cutoff = now - this.config.windowSec * 1000;
    this.tickTimes = this.tickTimes.filter((t) => t >= cutoff);

    const p50 = this.percentile(this.commandLatencies, 50);
    const p99 = this.percentile(this.commandLatencies, 99);

    const snapshot: MetricsSnapshot = {
      ticksPerSec: Number((this.tickTimes.length / this.config.windowSec).toFixed(2)),
      orderCreated: this.orderCreated,
      orderFilled: this.orderFilled,
      commandP50Ms: p50,
      commandP99Ms: p99,
      updatedAt: now
    };

    this.registry.emit("metrics.updated", snapshot);
  }

  private percentile(values: number[], p: number): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
    return Number((sorted[idx] ?? 0).toFixed(2));
  }
}
