import React from "react";
import { Box, Text } from "ink";
import type { Position } from "../types/portfolio";

interface ActiveTradesPanelProps {
  positions: readonly Position[];
}

export function ActiveTradesPanel({ positions }: ActiveTradesPanelProps): React.JSX.Element {
  const open = positions.filter((p) => p.status === "open");

  return (
    <Box borderStyle="round" borderColor="magenta" flexDirection="column" paddingX={1} minHeight={12}>
      <Text color="magenta">Active Trades</Text>
      <Text>OrderId     Inst     Qty       Entry      Mark       uPnL</Text>
      {open.slice(0, 10).map((p) => (
        <Text key={p.positionId}>
          {p.sourceOrderId.slice(0, 10).padEnd(10)} {p.instrument.padEnd(8)} {p.quantity
            .toFixed(4)
            .padStart(8)} {p.avgEntryPrice.toFixed(2).padStart(10)} {p.markPrice.toFixed(2).padStart(10)} {p.unrealizedPnl
            .toFixed(2)
            .padStart(10)}
        </Text>
      ))}
      {open.length === 0 ? <Text color="gray">No active trades</Text> : null}
    </Box>
  );
}
