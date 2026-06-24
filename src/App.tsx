import { useState } from "react";
import { Box, Typography, Paper, Stack, Divider, List, ListItemButton, ListItemText } from "@mui/material";
import { nodes } from "./data/nodes";
import type { Node } from "./types/node";
import { buildGraph } from "./utils/buildGraph";
import { findLowestCostPath } from "./utils/findRoute";
import { useMemo } from "react";

export default function App() {
  const [start, setStart] = useState<Node | null>(null);
  const [end, setEnd] = useState<Node | null>(null);
  const graph = useMemo(() => buildGraph(), []);
  const result =
  start && end
    ? findLowestCostPath(graph, start.id, end.id)
    : null;
  const handleClick = (node: Node) => {
    if (!start) {
      setStart(node);
      return;
    }

    if (!end) {
      setEnd(node);
      return;
    }

    setStart(node);
    setEnd(null);
  };

  return (
    <Box sx={{ p: 3, maxWidth: 900, mx: "auto" }}>
      <Typography variant="h4" gutterBottom>
        KSP DeltaV Planner
      </Typography>

      {/* Selection panel */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Stack spacing={1}>
          <Typography>
            <b>Start:</b>{" "}
            {start ? `${start.body} (${start.situation})` : "-"}
          </Typography>

          <Typography>
            <b>End:</b>{" "}
            {end ? `${end.body} (${end.situation})` : "-"}
          </Typography>
        </Stack>
      </Paper>

      <Divider sx={{ mb: 2 }} />

      {/* Node list */}
      <Paper sx={{ maxHeight: 400, overflow: "auto" }}>
        <List disablePadding>
          {nodes.map((node) => (
            <ListItemButton
              key={node.id}
              onClick={() => handleClick(node)}
              selected={
                start?.id === node.id || end?.id === node.id
              }
            >
              <ListItemText
                primary={`${node.body} - ${node.situation}`}
              />
            </ListItemButton>
          ))}
        </List>
      </Paper>
      {result && (
        <Paper sx={{ p: 2, mt: 2 }}>
          <Typography variant="h6">
            Total Delta-V: {result.cost} m/s
          </Typography>
      
          <Typography variant="subtitle2" sx={{ mt: 1 }}>
            Route:
          </Typography>
      
          <Typography>
            {result.path.join(" → ")}
          </Typography>
        </Paper>
      )}
    </Box>
  );
}