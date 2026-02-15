import type { OpenOrder } from "./order";

export interface ReviewRequest {
  id: string;
  order: OpenOrder;
  reason: string;
  confidence: number;
  createdAt: number;
}
