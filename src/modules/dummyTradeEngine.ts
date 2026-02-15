import type { ModuleRegistry } from "../boot/moduleRegistry";
import { debounce } from "../utils/debounce";
import type { MarketTick } from "../types/market";
import type { SystemModule } from "../types/module";
import type { OpenOrder, OrderFill, OrderReceipt, OrderSide } from "../types/order";
import type { PortfolioSnapshot, Position } from "../types/portfolio";
import type { ReviewRequest } from "../types/review";

interface RiskConfig {
  maxOrderQty: number;
  maxOrderNotional: number;
  maxOpenPositions: number;
}

interface DummyTradeEngineConfig {
  initialCash: number;
  defaultStrategy: string;
  risk: RiskConfig;
}

export class DummyTradeEngine implements SystemModule {
  private readonly positions = new Map<string, Position>();
  private readonly lastPrices = new Map<string, number>();
  private readonly pendingCloseByOrderId = new Map<string, string>();
  private readonly emitPortfolioDebounced = debounce(
    () => this.registry.emit("portfolio.updated", this.snapshotPortfolio()),
    75
  );

  private cashBalance: number;
  private realizedPnl = 0;
  private strategy: string;
  private botRunning = false;
  private reviewTimer?: ReturnType<typeof setInterval>;
  private marketUnsub?: () => void;

  constructor(
    private readonly registry: ModuleRegistry,
    private readonly config: DummyTradeEngineConfig
  ) {
    this.cashBalance = config.initialCash;
    this.strategy = config.defaultStrategy;
  }

  async start(): Promise<void> {
    this.marketUnsub = this.registry.on("market.tick", (tick) => this.onMarketTick(tick));
    this.registry.emit("strategy.changed", { strategy: this.strategy, ts: Date.now() });
    this.registry.emit("portfolio.updated", this.snapshotPortfolio());
    this.registry.emit("log", {
      level: "INFO",
      ts: Date.now(),
      message: `Trade engine started (${this.strategy})`
    });
  }

  async stop(): Promise<void> {
    this.marketUnsub?.();
    this.emitPortfolioDebounced.cancel();
    this.stopBot();
  }

  async openTrade(order: OpenOrder): Promise<OrderReceipt> {
    this.guardRisk(order);

    const now = Date.now();
    const orderId = this.newId("ord");
    const receipt: OrderReceipt = {
      orderId,
      instrument: order.instrument,
      quantity: order.quantity,
      side: order.side,
      type: order.type,
      status: "accepted",
      createdAt: now,
      strategy: order.strategy ?? this.strategy
    };

    this.registry.emit("order.created", receipt);

    const latencyMs = this.randInt(10, 50);
    setTimeout(() => this.fillOrder(order, receipt, latencyMs), latencyMs);

    return receipt;
  }

  async closeTrade(orderId: string): Promise<OrderReceipt> {
    const position = [...this.positions.values()].find(
      (p) => p.status === "open" && p.sourceOrderId === orderId
    );
    if (!position) {
      throw new Error(`No open position for ${orderId}`);
    }

    const side: OrderSide = position.quantity > 0 ? "sell" : "buy";
    const receipt = await this.openTrade({
      instrument: position.instrument,
      quantity: Math.abs(position.quantity),
      side,
      type: "market",
      strategy: this.strategy,
      source: "manual"
    });
    this.pendingCloseByOrderId.set(receipt.orderId, position.positionId);
    return receipt;
  }

  setBotRunning(running: boolean): void {
    if (running) {
      this.startBot();
      return;
    }
    this.stopBot();
  }

  switchStrategy(strategy: string): void {
    this.strategy = strategy;
    this.registry.emit("strategy.changed", { strategy, ts: Date.now() });
    this.registry.emit("log", {
      level: "INFO",
      ts: Date.now(),
      message: `Strategy switched to ${strategy}`
    });
  }

  requestReview(order: OpenOrder, reason: string): ReviewRequest {
    const req: ReviewRequest = {
      id: this.newId("rev"),
      order,
      reason,
      confidence: 0.4 + Math.random() * 0.59,
      createdAt: Date.now()
    };
    this.registry.emit("review.requested", req);
    return req;
  }

  getPortfolioSnapshot(): PortfolioSnapshot {
    return this.snapshotPortfolio();
  }

  private guardRisk(order: OpenOrder): void {
    if (order.quantity <= 0 || order.quantity > this.config.risk.maxOrderQty) {
      throw new Error(`Risk reject: quantity limit ${this.config.risk.maxOrderQty}`);
    }
    const openPositions = [...this.positions.values()].filter((p) => p.status === "open").length;
    if (openPositions >= this.config.risk.maxOpenPositions) {
      throw new Error(`Risk reject: max open positions ${this.config.risk.maxOpenPositions}`);
    }
    const px = this.lastPrices.get(order.instrument) ?? 0;
    if (px > 0) {
      const notional = px * order.quantity;
      if (notional > this.config.risk.maxOrderNotional) {
        throw new Error(`Risk reject: notional limit ${this.config.risk.maxOrderNotional}`);
      }
    }
  }

  private onMarketTick(tick: MarketTick): void {
    this.lastPrices.set(tick.instrument, tick.price);
    let dirty = false;
    for (const p of this.positions.values()) {
      if (p.status !== "open" || p.instrument !== tick.instrument) continue;
      p.markPrice = tick.price;
      p.unrealizedPnl = (tick.price - p.avgEntryPrice) * p.quantity;
      p.updatedAt = tick.ts;
      dirty = true;
    }
    if (dirty) this.emitPortfolioDebounced();
  }

  private fillOrder(order: OpenOrder, receipt: OrderReceipt, latencyMs: number): void {
    const markPrice = this.lastPrices.get(order.instrument) ?? (100 + Math.random() * 1000);
    const fillPrice =
      order.type === "limit" && order.limitPrice
        ? order.limitPrice
        : markPrice * (1 + (Math.random() - 0.5) * 0.0006);
    const fee = Math.max(0.1, order.quantity * fillPrice * 0.0005);

    const fill: OrderFill = {
      orderId: receipt.orderId,
      instrument: order.instrument,
      quantity: order.quantity,
      side: order.side,
      fillPrice,
      fee,
      latencyMs,
      filledAt: Date.now()
    };

    this.applyCash(fill);
    this.applyPosition(fill);

    this.registry.emit("order.filled", fill);
    this.registry.emit("portfolio.updated", this.snapshotPortfolio());
  }

  private applyCash(fill: OrderFill): void {
    const gross = fill.quantity * fill.fillPrice;
    if (fill.side === "buy") {
      this.cashBalance -= gross + fill.fee;
    } else {
      this.cashBalance += gross - fill.fee;
    }
  }

  private applyPosition(fill: OrderFill): void {
    const closePosId = this.pendingCloseByOrderId.get(fill.orderId);
    if (closePosId) {
      const p = this.positions.get(closePosId);
      if (p && p.status === "open") {
        const pnl = (fill.fillPrice - p.avgEntryPrice) * p.quantity - fill.fee;
        p.realizedPnl += pnl;
        p.unrealizedPnl = 0;
        p.markPrice = fill.fillPrice;
        p.status = "closed";
        p.updatedAt = fill.filledAt;
        this.realizedPnl += pnl;
      }
      this.pendingCloseByOrderId.delete(fill.orderId);
      return;
    }

    const signedQty = fill.side === "buy" ? fill.quantity : -fill.quantity;
    const p: Position = {
      positionId: this.newId("pos"),
      sourceOrderId: fill.orderId,
      instrument: fill.instrument,
      quantity: signedQty,
      avgEntryPrice: fill.fillPrice,
      markPrice: fill.fillPrice,
      realizedPnl: 0,
      unrealizedPnl: 0,
      status: "open",
      openedAt: fill.filledAt,
      updatedAt: fill.filledAt
    };
    this.positions.set(p.positionId, p);
  }

  private snapshotPortfolio(): PortfolioSnapshot {
    const positions = [...this.positions.values()];
    const unrealizedPnl = positions
      .filter((p) => p.status === "open")
      .reduce((sum, p) => sum + p.unrealizedPnl, 0);
    const marginUsed = positions
      .filter((p) => p.status === "open")
      .reduce((sum, p) => sum + Math.abs(p.quantity * p.markPrice) * 0.1, 0);
    return {
      cashBalance: this.cashBalance,
      equity: this.cashBalance + unrealizedPnl,
      marginUsed,
      realizedPnl: this.realizedPnl,
      unrealizedPnl,
      positions,
      updatedAt: Date.now()
    };
  }

  private startBot(): void {
    if (this.botRunning) return;
    this.botRunning = true;
    this.registry.emit("bot.state", { running: true, ts: Date.now() });
    this.reviewTimer = setInterval(() => {
      const inst = [...this.lastPrices.keys()];
      if (inst.length === 0) return;
      const instrument = inst[this.randInt(0, inst.length - 1)] ?? "BTCUSD";
      this.requestReview(
        {
          instrument,
          quantity: Number((0.01 + Math.random() * 0.09).toFixed(4)),
          side: Math.random() > 0.5 ? "buy" : "sell",
          type: "market",
          strategy: this.strategy,
          source: "auto"
        },
        "Auto signal requires review"
      );
    }, 2500);
  }

  private stopBot(): void {
    if (!this.botRunning) return;
    this.botRunning = false;
    if (this.reviewTimer) clearInterval(this.reviewTimer);
    this.reviewTimer = undefined;
    this.registry.emit("bot.state", { running: false, ts: Date.now() });
  }

  private randInt(min: number, max: number): number {
    const lo = Math.ceil(min);
    const hi = Math.floor(max);
    return Math.floor(Math.random() * (hi - lo + 1)) + lo;
  }

  private newId(prefix: string): string {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }
}
