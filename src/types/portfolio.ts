export type PositionStatus = "open" | "closed";

export interface Position {
  positionId: string;
  sourceOrderId: string;
  instrument: string;
  quantity: number;
  avgEntryPrice: number;
  markPrice: number;
  realizedPnl: number;
  unrealizedPnl: number;
  status: PositionStatus;
  openedAt: number;
  updatedAt: number;
}

export interface PortfolioSnapshot {
  cashBalance: number;
  equity: number;
  marginUsed: number;
  realizedPnl: number;
  unrealizedPnl: number;
  positions: Position[];
  updatedAt: number;
}
