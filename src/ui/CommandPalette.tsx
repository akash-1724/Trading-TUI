import React, { useEffect, useMemo, useState } from "react";
import { Box, Text, useInput } from "ink";
import type { CommandDefinition } from "../types/commands";

interface CommandPaletteProps {
  isOpen: boolean;
  commands: readonly CommandDefinition[];
  onClose: () => void;
  onExecute: (command: string) => void;
}

export function CommandPalette({
  isOpen,
  commands,
  onClose,
  onExecute
}: CommandPaletteProps): React.JSX.Element | null {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((cmd) =>
      `${cmd.label} ${cmd.command} ${cmd.description}`.toLowerCase().includes(q)
    );
  }, [commands, query]);

  useEffect(() => setSelected(0), [query]);

  useInput((input, key) => {
    if (!isOpen) return;
    if (key.escape) return onClose();
    if (key.upArrow) return setSelected((prev) => (prev <= 0 ? Math.max(filtered.length - 1, 0) : prev - 1));
    if (key.downArrow) return setSelected((prev) => (filtered.length === 0 ? 0 : (prev + 1) % filtered.length));

    if (key.return) {
      const selectedCmd = filtered[selected];
      const text = query.trim().length > 0 ? query.trim() : selectedCmd?.command;
      if (text) onExecute(text.startsWith("/") ? text : `/${text}`);
      setQuery("");
      onClose();
      return;
    }

    if (key.backspace || key.delete) return setQuery((prev) => prev.slice(0, -1));

    if (input && !key.ctrl && !key.meta) {
      if (input === "/" || input === "\\") return;
      setQuery((prev) => prev + input);
    }
  });

  if (!isOpen) return null;

  return (
    <Box borderStyle="round" borderColor="cyan" flexDirection="column" paddingX={1} marginTop={1}>
      <Text color="cyan">Command Palette</Text>
      <Text>/ {query || "<type command or search>"}</Text>
      <Box flexDirection="column" marginTop={1}>
        {filtered.slice(0, 8).map((cmd, index) => {
          const active = index === selected;
          return (
            <Text key={cmd.id} color={active ? "green" : "white"}>
              {active ? ">" : " "} {cmd.command} - {cmd.description}
            </Text>
          );
        })}
      </Box>
      <Text color="gray">Esc close | Arrows navigate | Enter execute</Text>
    </Box>
  );
}
