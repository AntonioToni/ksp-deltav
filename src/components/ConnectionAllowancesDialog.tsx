import { useId, useState } from 'react'
import {
  Box, Button, Dialog, DialogActions, DialogContent, DialogTitle,
  InputAdornment, TextField, Typography,
} from '@mui/material'
import type { PlanetPack } from '../types/planner'
import type { ConnectionAllowance, ConnectionPlan } from '../utils/connectionAllowances'

interface ConnectionAllowancesDialogProps {
  open: boolean
  pack: PlanetPack
  plan: ConnectionPlan
  onApply: (plan: ConnectionAllowance[]) => void
  onClose: () => void
}

interface DraftAllowance {
  connectionId: string
  forward: string
  reverse: string
}

function parsedAllowance(text: string): number | null {
  return text.trim() === '' ? null : Number(text)
}

function validAllowance(text: string): boolean {
  const value = parsedAllowance(text)
  return value === null || Number.isFinite(value) && value >= 0 && value <= 1_000_000
}

function AllowancesContent({ pack, plan, onApply, onClose, headingId, descriptionId }: Omit<ConnectionAllowancesDialogProps, 'open'> & { headingId: string; descriptionId: string }) {
  const connections = pack.unpricedConnections ?? []
  const nodes = new Map(pack.nodes.map(node => [node.id, node]))
  const [draft, setDraft] = useState<DraftAllowance[]>(() => connections.map(connection => {
    const saved = plan.find(row => row.connectionId === connection.id)
    return {
      connectionId: connection.id,
      forward: saved?.forward === null || saved?.forward === undefined ? '' : String(saved.forward),
      reverse: saved?.reverse === null || saved?.reverse === undefined ? '' : String(saved.reverse),
    }
  }))
  const valid = draft.every(row => validAllowance(row.forward) && validAllowance(row.reverse))
  const enteredCount = draft.reduce((sum, row) => sum
    + (row.forward.trim() !== '' && validAllowance(row.forward) ? 1 : 0)
    + (row.reverse.trim() !== '' && validAllowance(row.reverse) ? 1 : 0), 0)
  const hasDraft = draft.some(row => row.forward.trim() !== '' || row.reverse.trim() !== '')

  function update(connectionId: string, direction: 'forward' | 'reverse', value: string) {
    setDraft(previous => previous.map(row => row.connectionId === connectionId ? { ...row, [direction]: value } : row))
  }

  function apply() {
    if (!valid) return
    const next = draft.map(row => ({
      connectionId: row.connectionId,
      forward: parsedAllowance(row.forward),
      reverse: parsedAllowance(row.reverse),
    })).filter(row => row.forward !== null || row.reverse !== null)
    onApply(next)
  }

  return <>
    <DialogTitle id={`${headingId}-container`} sx={{ px: 1.5, py: 1, fontSize: 16, lineHeight: 1.5, flexShrink: 0 }}>
      <Box component="span" id={headingId}>Link allowances</Box>
    </DialogTitle>
    <Box id={descriptionId} sx={{ px: 1.5, pb: 1, flexShrink: 0 }}>
      <Typography sx={{ fontSize: 12, lineHeight: 1.4, color: 'text.secondary' }}>
        These links have no complete published budget. Forward and Reverse follow the endpoints below independently of the mission mode. Enter your whole maneuver allowance; blank is unavailable, and zero is your assumption.
      </Typography>
    </Box>
    <DialogContent sx={{ px: 1.5, pt: .5, pb: 1, minWidth: 0, minHeight: 0, overflowY: 'auto' }}>
      {connections.length === 0 && <Typography sx={{ p: 1.25, border: '1px dashed', borderColor: 'divider', borderRadius: 1, fontSize: 12, lineHeight: 1.4, color: 'text.secondary' }}>
        This pack has no unpriced links.
      </Typography>}
      <Box component="ul" aria-label="Unpriced link allowances" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 1 }}>
        {connections.map((connection, index) => {
          const row = draft.find(candidate => candidate.connectionId === connection.id)!
          const from = nodes.get(connection.from)?.label ?? connection.from
          const to = nodes.get(connection.to)?.label ?? connection.to
          const rowHeadingId = `${headingId}-row-${index}`
          return <Box component="li" key={connection.id} aria-labelledby={rowHeadingId} data-allowance-id={connection.id} sx={{ p: 1, minWidth: 0, border: '1px solid', borderColor: 'divider', borderRadius: 1, bgcolor: '#ffffff03' }}>
            <Typography component="h3" id={rowHeadingId} sx={{ fontSize: 12.5, fontWeight: 500, lineHeight: 1.4, overflowWrap: 'anywhere' }}>{connection.label}</Typography>
            {connection.assumptions[0] && <Typography sx={{ mt: .25, mb: 1, fontSize: 11, lineHeight: 1.4, color: 'text.secondary', overflowWrap: 'anywhere' }}>{connection.assumptions[0]}</Typography>}
            <Box sx={{ mt: .75, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1 }}>
              {(['forward', 'reverse'] as const).map(direction => {
                const label = direction === 'forward' ? 'Forward' : 'Reverse'
                const text = row[direction]
                const invalid = !validAllowance(text)
                const journey = direction === 'forward' ? `${from} → ${to}` : `${to} → ${from}`
                return <Box key={direction} sx={{ minWidth: 0 }}>
                  <TextField fullWidth size="small" type="number" label={label} value={text} error={invalid}
                    onChange={event => update(connection.id, direction, event.target.value)} placeholder="Unpriced"
                    slotProps={{
                      htmlInput: { 'aria-label': `${label} allowance for ${connection.label}`, min: 0, max: 1_000_000, step: 'any' },
                      input: { endAdornment: <InputAdornment position="end"><Typography sx={{ fontSize: 10 }}>m/s</Typography></InputAdornment> },
                    }}
                    sx={{ minWidth: 0, '& .MuiInputBase-root': { fontSize: 12, minHeight: 38 }, '& .MuiInputLabel-root': { fontSize: 11 }, '& .MuiInputBase-input': { px: 1, py: 1, fontVariantNumeric: 'tabular-nums' }, '& .MuiInputAdornment-root': { ml: .25 } }} />
                  <Typography sx={{ mt: .5, fontSize: 11, lineHeight: 1.4, color: 'text.secondary', overflowWrap: 'anywhere' }}>{journey}</Typography>
                  {invalid && <Typography sx={{ mt: .25, fontSize: 10, lineHeight: 1.3, color: 'error.main' }}>Enter 0–1,000,000 m/s or leave blank.</Typography>}
                </Box>
              })}
            </Box>
          </Box>
        })}
      </Box>
    </DialogContent>
    <Box sx={{ px: 1.5, py: .75, minWidth: 0, flexShrink: 0, borderTop: '1px solid', borderColor: 'divider', bgcolor: '#080f2135' }}>
      <Typography role="status" sx={{ fontSize: 11, lineHeight: 1.4, color: valid ? 'text.secondary' : 'secondary.main' }}>
        {valid ? <><Box component="span" data-testid="link-allowance-count">{enteredCount}</Box> of {connections.length * 2} directions entered. Blank directions remain unavailable.</> : 'Fix invalid allowances before applying.'}
      </Typography>
    </Box>
    <DialogActions sx={{ px: 1.5, py: .75, gap: .5, flexShrink: 0 }}>
      <Button size="small" disabled={!hasDraft} onClick={() => setDraft(previous => previous.map(row => ({ ...row, forward: '', reverse: '' })))} sx={{ minHeight: 36, minWidth: 0, px: .5, mr: 'auto', fontSize: 11 }}>Clear allowances</Button>
      <Button size="small" onClick={onClose} sx={{ minHeight: 36, minWidth: 0, px: 1, fontSize: 12 }}>Cancel</Button>
      <Button size="small" variant="contained" disabled={!valid} onClick={apply} sx={{ minHeight: 36, minWidth: 60, px: 1.5, fontSize: 12 }}>Apply</Button>
    </DialogActions>
  </>
}

export default function ConnectionAllowancesDialog({ open, pack, plan, onApply, onClose }: ConnectionAllowancesDialogProps) {
  const id = useId().replace(/:/g, '')
  const headingId = `${id}-connection-allowances-heading`
  const descriptionId = `${id}-connection-allowances-description`
  return <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" aria-labelledby={headingId} aria-describedby={descriptionId} sx={{ '& .MuiDialog-paper': { m: 1, width: 'calc(100% - 16px)', maxHeight: 'calc(100dvh - 16px)' } }}>
    <AllowancesContent key={`${pack.id}:${open}`} pack={pack} plan={plan} onApply={onApply} onClose={onClose} headingId={headingId} descriptionId={descriptionId} />
  </Dialog>
}
