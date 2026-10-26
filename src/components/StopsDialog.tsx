import { useRef, useState } from 'react'
import {
  Autocomplete, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle,
  IconButton, Stack, TextField, Typography,
} from '@mui/material'
import ArrowUpwardRounded from '@mui/icons-material/ArrowUpwardRounded'
import ArrowDownwardRounded from '@mui/icons-material/ArrowDownwardRounded'
import CloseRounded from '@mui/icons-material/CloseRounded'
import AddRounded from '@mui/icons-material/AddRounded'
import TouchAppRounded from '@mui/icons-material/TouchAppRounded'
import type { PlanetPack, RouteNode } from '../types/planner'

interface StopsDialogProps {
  open: boolean
  pack: PlanetPack
  waypointIds: readonly string[]
  startId: string | null
  endId: string | null
  onChange: (ids: string[]) => void
  onClose: () => void
  onSelectOnMap: () => void
}

const maxStops = 4
const landscape = '@media (min-width: 600px) and (max-height: 500px)'

function StopsContent({ pack, waypointIds, startId, endId, onChange, onSelectOnMap }: Omit<StopsDialogProps, 'open' | 'onClose'>) {
  const [selected, setSelected] = useState<RouteNode | null>(null)
  const rowRefs = useRef<Array<HTMLLIElement | null>>([])
  const nodes = new Map(pack.nodes.map(node => [node.id, node]))
  const atLimit = waypointIds.length >= maxStops

  function move(index: number, direction: -1 | 1) {
    const nextIndex = index + direction
    if (nextIndex < 0 || nextIndex >= waypointIds.length) return
    const next = [...waypointIds]
    const current = next[index]
    const neighbor = next[nextIndex]
    if (current === undefined || neighbor === undefined) return
    next[index] = neighbor
    next[nextIndex] = current
    onChange(next)
    requestAnimationFrame(() => rowRefs.current[nextIndex]?.focus())
  }

  function add() {
    if (!selected || atLimit) return
    onChange([...waypointIds, selected.id])
    setSelected(null)
  }

  return <DialogContent sx={{ px: 1.5, pt: .5, pb: 1, overflowY: 'auto' }}>
    <Typography id="mission-stops-description" sx={{ fontSize: 12, lineHeight: 1.35, color: 'text.secondary', mb: .75 }}>
      Stops are visited in outbound order. Return journeys visit them in reverse.
    </Typography>
    <Typography title={`${nodes.get(startId ?? '')?.label ?? 'Select origin'} → ${nodes.get(endId ?? '')?.label ?? 'Select destination'}`} sx={{ fontSize: 11, lineHeight: 1.4, mb: 1, color: 'text.secondary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
      <Box component="span" sx={{ color: 'primary.main' }}>{nodes.get(startId ?? '')?.label ?? 'Select origin'}</Box>
      {' → '}
      <Box component="span" sx={{ color: 'secondary.main' }}>{nodes.get(endId ?? '')?.label ?? 'Select destination'}</Box>
    </Typography>
    <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 1, [landscape]: { gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 1fr)', gap: 1.5, alignItems: 'start' } }}>
      <Box sx={{ minWidth: 0 }}>
        {waypointIds.length === 0 && <Typography sx={{ px: 1, py: 1.5, fontSize: 12, color: 'text.secondary', border: '1px dashed', borderColor: 'divider', borderRadius: 1 }}>
          Add up to four intermediate states.
        </Typography>}
        <Box component="ol" aria-label="Mission stops" sx={{ listStyle: 'none', p: 0, m: 0, display: 'grid', gap: .5 }}>
          {waypointIds.map((id, index) => {
            const label = nodes.get(id)?.label ?? 'Unavailable state'
            return <Box component="li" key={index} ref={element => { rowRefs.current[index] = element instanceof HTMLLIElement ? element : null }} tabIndex={-1} aria-label={`Stop ${index + 1}: ${label}`} sx={{ minHeight: 40, display: 'grid', gridTemplateColumns: '22px minmax(0, 1fr) auto', alignItems: 'center', columnGap: .75, px: .5, py: .25, border: '1px solid', borderColor: 'divider', borderRadius: 1, bgcolor: '#ffffff03', '&:focus-visible': { outline: '2px solid #b3e3ff', outlineOffset: 1 } }}>
              <Box component="span" sx={{ width: 22, height: 22, display: 'grid', placeItems: 'center', borderRadius: '50%', bgcolor: '#92d5c61a', color: '#a5e4d5', fontSize: 12, fontWeight: 700 }}>{index + 1}</Box>
              <Typography title={label} sx={{ fontSize: 12, lineHeight: 1.2, overflowWrap: 'anywhere' }}>{label}</Typography>
              <Stack direction="row" spacing={0}>
                <IconButton size="small" aria-label={`Move stop ${index + 1} up`} disabled={index === 0} onClick={() => move(index, -1)} sx={{ p: .5, width: 28, height: 28 }}><ArrowUpwardRounded sx={{ fontSize: 16 }} /></IconButton>
                <IconButton size="small" aria-label={`Move stop ${index + 1} down`} disabled={index === waypointIds.length - 1} onClick={() => move(index, 1)} sx={{ p: .5, width: 28, height: 28 }}><ArrowDownwardRounded sx={{ fontSize: 16 }} /></IconButton>
                <IconButton size="small" aria-label={`Remove stop ${index + 1}`} onClick={() => onChange(waypointIds.filter((_, row) => row !== index))} sx={{ p: .5, width: 28, height: 28 }}><CloseRounded sx={{ fontSize: 16 }} /></IconButton>
              </Stack>
            </Box>
          })}
        </Box>
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Stack direction="row" spacing={.75} sx={{ alignItems: 'center' }}>
          <Autocomplete<RouteNode> fullWidth size="small" options={pack.nodes} value={selected} onChange={(_, value) => setSelected(value)} getOptionLabel={option => option.label} getOptionKey={option => option.id} isOptionEqualToValue={(option, value) => option.id === value.id} disabled={atLimit} renderInput={params => <TextField {...params} label="Choose a stop" />} sx={{ minWidth: 0, '& .MuiInputBase-root': { fontSize: 12 }, '& .MuiInputLabel-root': { fontSize: 12 } }} slotProps={{ listbox: { sx: { fontSize: 12 } } }} />
          <Button size="small" variant="outlined" aria-label="Add stop" disabled={!selected || atLimit} onClick={add} sx={{ minWidth: 36, minHeight: 36, px: .5 }}><AddRounded sx={{ fontSize: 20 }} /></Button>
        </Stack>
        <Button size="small" startIcon={<TouchAppRounded sx={{ fontSize: '17px !important' }} />} disabled={atLimit} onClick={onSelectOnMap} sx={{ fontSize: 12, minHeight: 32, mt: .5, px: .5 }}>Select stop on map</Button>
        {atLimit && <Typography role="status" sx={{ fontSize: 11, color: 'text.secondary', mt: .25 }}>All four stops are in use.</Typography>}
      </Box>
    </Box>
  </DialogContent>
}

export default function StopsDialog({ open, pack, waypointIds, startId, endId, onChange, onClose, onSelectOnMap }: StopsDialogProps) {
  return <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" aria-labelledby="mission-stops-heading" aria-describedby="mission-stops-description" sx={{ '& .MuiDialog-paper': { m: 1, width: 'calc(100% - 16px)', maxHeight: 'calc(100dvh - 16px)' } }}>
    <DialogTitle id="mission-stops-heading" sx={{ px: 1.5, py: 1, fontSize: 16, lineHeight: 1.5 }}>Mission stops <Box component="span" aria-hidden="true" sx={{ ml: .5, fontSize: 12, color: 'text.secondary', fontWeight: 400 }}>{waypointIds.length}/{maxStops}</Box></DialogTitle>
    <StopsContent key={`${pack.id}:${open}`} pack={pack} waypointIds={waypointIds} startId={startId} endId={endId} onChange={onChange} onSelectOnMap={onSelectOnMap} />
    <DialogActions sx={{ px: 1.5, py: .75, justifyContent: 'space-between' }}>
      {waypointIds.length > 0 ? <Button size="small" onClick={() => onChange([])} sx={{ minHeight: 36, px: .5, fontSize: 12 }}>Remove all stops</Button> : <Box />}
      <Button size="small" variant="contained" onClick={onClose} sx={{ minHeight: 36, px: 2, fontSize: 12 }}>Done</Button>
    </DialogActions>
  </Dialog>
}
