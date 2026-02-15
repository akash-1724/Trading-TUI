export interface MarketTick {
  instrument: string;
  price: number;
  bid: number;
  ask: number;
  volume?: number;
  ts: number;
}

export type ConnectionState = "connecting" | "connected" | "disconnected" | "reconnecting";

export interface MarketConnectionEvent {
  source: "dummy" | "exchange";
  state: ConnectionState;
  ts: number;
  message?: string;
}
