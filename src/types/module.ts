import type { EventKey, EventMap } from "./events";

export interface TypedEventBus {
  emit<K extends EventKey>(event: K, payload: EventMap[K]): void;
  on<K extends EventKey>(event: K, handler: (payload: EventMap[K]) => void): () => void;
  off<K extends EventKey>(event: K, handler: (payload: EventMap[K]) => void): void;
}

export interface SystemModule {
  start(): Promise<void> | void;
  stop(): Promise<void> | void;
}
