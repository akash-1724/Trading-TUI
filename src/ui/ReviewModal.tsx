import React from "react";
import { Box, Text, useInput } from "ink";
import type { ReviewRequest } from "../types/review";

interface ReviewModalProps {
  request?: ReviewRequest;
  onApprove: (request: ReviewRequest) => void;
  onReject: (request: ReviewRequest) => void;
}

export function ReviewModal({ request, onApprove, onReject }: ReviewModalProps): React.JSX.Element | null {
  useInput((input) => {
    if (!request) return;
    const ch = input.toLowerCase();
    if (ch === "y") onApprove(request);
    if (ch === "n") onReject(request);
  });

  if (!request) return null;

  return (
    <Box borderStyle="double" borderColor="yellow" flexDirection="column" paddingX={1} marginTop={1}>
      <Text color="yellow">Review Request</Text>
      <Text>ID: {request.id}</Text>
      <Text>
        {request.order.side} {request.order.quantity} {request.order.instrument} ({request.order.type})
      </Text>
      <Text>Reason: {request.reason}</Text>
      <Text>Confidence: {(request.confidence * 100).toFixed(1)}%</Text>
      <Text color="cyan">Press y to approve | n to reject</Text>
    </Box>
  );
}
