import type { EventKey, EventMap } from "../types/events";
import type { SystemModule } from "../types/module";

type EventHandler<K extends EventKey> = (payload: EventMap[K]) => void;

export class ModuleRegistry {
  private readonly modules = new Map<string, SystemModule>();
  private readonly handlers: { [K in EventKey]?: Set<EventHandler<K>> } = {};

  register(name: string, module: SystemModule): void {
    if (this.modules.has(name)) {
      throw new Error(`Module '${name}' is already registered`);
    }
    this.modules.set(name, module);
  }

  async unregister(name: string): Promise<void> {
    const module = this.modules.get(name);
    if (!module) return;
    await module.stop();
    this.modules.delete(name);
  }

  get<T extends SystemModule>(name: string): T | undefined {
    return this.modules.get(name) as T | undefined;
  }

  on<K extends EventKey>(event: K, handler: EventHandler<K>): () => void {
    const current = this.handlers[event] as Set<EventHandler<K>> | undefined;
    const set = current ?? new Set<EventHandler<K>>();
    set.add(handler);
    this.handlers[event] = set as { [P in EventKey]?: Set<EventHandler<P>> }[K];
    return () => this.off(event, handler);
  }

  off<K extends EventKey>(event: K, handler: EventHandler<K>): void {
    const set = this.handlers[event] as Set<EventHandler<K>> | undefined;
    set?.delete(handler);
  }

  emit<K extends EventKey>(event: K, payload: EventMap[K]): void {
    const set = this.handlers[event] as Set<EventHandler<K>> | undefined;
    if (!set || set.size === 0) return;
    for (const handler of set) {
      queueMicrotask(() => handler(payload));
    }
  }

  async stopAll(): Promise<void> {
    await Promise.all([...this.modules.values()].map((m) => Promise.resolve(m.stop())));
    this.modules.clear();
  }
}
