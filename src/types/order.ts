export type OrderSide = "buy" | "sell";
export type OrderType = "market" | "limit";
export type OrderSource = "manual" | "auto" | "review-approved";

export interface OpenOrder {
  instrument: string;
  quantity: number;
  side: OrderSide;
  type: OrderType;
  limitPrice?: number;
  strategy?: string;
  source: OrderSource;
}

export type OrderStatus = "accepted" | "rejected" | "filled" | "cancelled";

export interface OrderReceipt {
  orderId: string;
  instrument: string;
  quantity: number;
  side: OrderSide;
  type: OrderType;
  status: OrderStatus;
  createdAt: number;
  strategy: string;
}

export interface OrderFill {
  orderId: string;
  instrument: string;
  quantity: number;
  side: OrderSide;
  fillPrice: number;
  fee: number;
  latencyMs: number;
  filledAt: number;
}
