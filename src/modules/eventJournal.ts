import type { ModuleRegistry } from "../boot/moduleRegistry";
import type { EventKey, EventMap } from "../types/events";
import type { SystemModule } from "../types/module";

interface EventJournalConfig {
  enabled: boolean;
  path: string;
  flushMs: number;
}

interface JournalRow<K extends EventKey = EventKey> {
  event: K;
  ts: number;
  payload: EventMap[K];
}

export class EventJournal implements SystemModule {
  private readonly buffer: JournalRow[] = [];
  private flushTimer?: ReturnType<typeof setInterval>;
  private unsubs: Array<() => void> = [];

  constructor(
    private readonly registry: ModuleRegistry,
    private readonly config: EventJournalConfig
  ) {}

  async start(): Promise<void> {
    if (!this.config.enabled) return;

    await Bun.write(this.config.path, "");

    const events: EventKey[] = [
      "market.tick",
      "order.created",
      "order.filled",
      "portfolio.updated",
      "review.requested",
      "log"
    ];

    for (const event of events) {
      const unsub = this.registry.on(event, (payload) => {
        this.buffer.push({ event, ts: Date.now(), payload });
      });
      this.unsubs.push(unsub);
    }

    this.flushTimer = setInterval(() => {
      void this.flush();
    }, this.config.flushMs);
  }

  async stop(): Promise<void> {
    if (!this.config.enabled) return;
    if (this.flushTimer) clearInterval(this.flushTimer);
    this.flushTimer = undefined;
    for (const unsub of this.unsubs) unsub();
    this.unsubs = [];
    await this.flush();
  }

  private async flush(): Promise<void> {
    if (this.buffer.length === 0) return;

    const existing = await Bun.file(this.config.path)
      .text()
      .catch(() => "");

    const lines = this.buffer.splice(0).map((row) => JSON.stringify(row)).join("\n") + "\n";
    await Bun.write(this.config.path, existing + lines);
  }
}
