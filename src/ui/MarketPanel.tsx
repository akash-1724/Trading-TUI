import React from "react";
import { Box, Text } from "ink";
import type { ConnectionState } from "../types/market";

export interface MarketRow {
  instrument: string;
  price: number;
  bid: number;
  ask: number;
  volume?: number;
  sparkline: string;
}

interface MarketPanelProps {
  rows: readonly MarketRow[];
  connectionState: ConnectionState;
}

export function MarketPanel({ rows, connectionState }: MarketPanelProps): React.JSX.Element {
  return (
    <Box borderStyle="round" borderColor="green" flexDirection="column" paddingX={1} minHeight={12}>
      <Text color="green">Market Feed [{connectionState.toUpperCase()}]</Text>
      <Text>Inst      Price        Bid          Ask          Vol    Spark</Text>
      {rows.slice(0, 8).map((row) => (
        <Text key={row.instrument}>
          {row.instrument.padEnd(8)} {row.price.toFixed(2).padStart(10)} {row.bid.toFixed(2).padStart(10)} {row.ask
            .toFixed(2)
            .padStart(10)} {(row.volume ?? 0).toFixed(2).padStart(7)} {row.sparkline}
        </Text>
      ))}
      {rows.length === 0 ? <Text color="yellow">Waiting for ticks...</Text> : null}
    </Box>
  );
}
