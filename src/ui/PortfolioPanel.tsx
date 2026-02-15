import React from "react";
import { Box, Text } from "ink";
import type { PortfolioSnapshot } from "../types/portfolio";

interface PortfolioPanelProps {
  portfolio: PortfolioSnapshot;
}

function pnlColor(value: number): "green" | "red" | "white" {
  if (value > 0) return "green";
  if (value < 0) return "red";
  return "white";
}

export function PortfolioPanel({ portfolio }: PortfolioPanelProps): React.JSX.Element {
  return (
    <Box borderStyle="round" borderColor="blue" flexDirection="column" paddingX={1} minHeight={10}>
      <Text color="blue">Portfolio</Text>
      <Text>Cash: ${portfolio.cashBalance.toFixed(2)}</Text>
      <Text>Equity: ${portfolio.equity.toFixed(2)}</Text>
      <Text color={pnlColor(portfolio.realizedPnl)}>Realized: {portfolio.realizedPnl.toFixed(2)}</Text>
      <Text color={pnlColor(portfolio.unrealizedPnl)}>Unrealized: {portfolio.unrealizedPnl.toFixed(2)}</Text>
      <Text>Margin Used: ${portfolio.marginUsed.toFixed(2)}</Text>
      <Text>Open Positions: {portfolio.positions.filter((p) => p.status === "open").length}</Text>
    </Box>
  );
}
