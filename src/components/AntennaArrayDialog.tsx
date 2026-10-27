import { useId, useRef, useState } from 'react'
import {
  Box, Button, Dialog, DialogActions, DialogContent, DialogTitle,
  IconButton, MenuItem, Stack, TextField, Typography,
} from '@mui/material'
import AddRounded from '@mui/icons-material/AddRounded'
import CloseRounded from '@mui/icons-material/CloseRounded'
import { relayAntennas, vesselAntennas } from '../data/commnet'
import { calculateAntennaArray, type AntennaArrayEntry } from '../utils/antennaArray'

interface AntennaArrayDialogProps {
  open: boolean
  role: 'relay' | 'client'
  entries: readonly AntennaArrayEntry[]
  onApply: (entries: AntennaArrayEntry[]) => void
  onClose: () => void
}

interface DraftEntry {
  key: number
  antennaId: string
  count: string
}

const powerFormat = new Intl.NumberFormat('en-US', { maximumSignificantDigits: 4 })
const exactFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 })

function formatPower(power: number): string {
  if (power >= 1e9) return `${powerFormat.format(power / 1e9)} Gm`
  if (power >= 1e6) return `${powerFormat.format(power / 1e6)} Mm`
  if (power >= 1e3) return `${powerFormat.format(power / 1e3)} km`
  return `${powerFormat.format(power)} m`
}

function validCount(text: string): boolean {
  const count = Number(text)
  return text.trim() !== '' && Number.isInteger(count) && count >= 1 && count <= 100
}

function ArrayContent({ role, entries, onApply, onClose, headingId, descriptionId }: Omit<AntennaArrayDialogProps, 'open'> & { headingId: string; descriptionId: string }) {
  const antennas = role === 'relay' ? relayAntennas : vesselAntennas
  const [draft, setDraft] = useState<DraftEntry[]>(() => entries.map((entry, index) => ({ key: index, antennaId: entry.antennaId, count: String(entry.count) })))
  const nextKey = useRef(entries.length)
  const parsed = draft.map(entry => ({ antennaId: entry.antennaId, count: entry.count.trim() === '' ? NaN : Number(entry.count) }))
  const result = calculateAntennaArray(parsed, role)
  const available = antennas.filter(antenna => !draft.some(entry => entry.antennaId === antenna.id))
  const enteredCount = draft.reduce((sum, entry) => sum + (validCount(entry.count) ? Number(entry.count) : 0), 0)
  const atLimit = available.length === 0 || enteredCount >= 100
  const title = role === 'relay' ? 'Relay antenna array' : 'Surface antenna array'

  function update(key: number, changes: Partial<Omit<DraftEntry, 'key'>>) {
    setDraft(previous => previous.map(entry => entry.key === key ? { ...entry, ...changes } : entry))
  }

  function add() {
    const antenna = available[0]
    if (atLimit || !antenna) return
    const key = nextKey.current++
    setDraft(previous => [...previous, { key, antennaId: antenna.id, count: '1' }])
  }

  return <>
    <DialogTitle id={`${headingId}-container`} sx={{ px: 1.5, py: 1, fontSize: 16, lineHeight: 1.5 }}>
      <Box component="span" id={headingId}>{title}</Box>
    </DialogTitle>
    <Box id={descriptionId} sx={{ px: 1.5, pb: .75 }}>
      <Typography sx={{ fontSize: 12, lineHeight: 1.4, color: 'text.secondary' }}>
        {role === 'relay'
          ? 'This loadout is fitted to each relay. Antennas on separate satellites do not combine.'
          : 'This loadout describes one surface craft. Direct and relay antennas may combine for this endpoint.'}
      </Typography>
    </Box>
    <DialogContent sx={{ px: 1.5, pt: .5, pb: .75, minWidth: 0, minHeight: 0, overflowY: 'auto' }}>
      {draft.length === 0 && <Typography sx={{ p: 1.25, fontSize: 12, lineHeight: 1.4, color: 'text.secondary', border: '1px dashed', borderColor: 'divider', borderRadius: 1 }}>
        Add an antenna to calculate this craft's power.
      </Typography>}
      <Box component="ul" aria-label="Antenna array parts" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: .75 }}>
        {draft.map((entry, index) => {
          const antenna = antennas.find(candidate => candidate.id === entry.antennaId)
          const invalidCount = entry.count !== '' && !validCount(entry.count)
          return <Box component="li" key={entry.key} sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 74px 30px', columnGap: .5, rowGap: .5, alignItems: 'center', px: .75, py: .75, minWidth: 0, border: '1px solid', borderColor: 'divider', borderRadius: 1, bgcolor: '#ffffff03' }}>
            <TextField select fullWidth size="small" label={`Antenna ${index + 1}`} value={entry.antennaId} onChange={event => update(entry.key, { antennaId: event.target.value })} sx={{ minWidth: 0, '& .MuiInputBase-root': { fontSize: 12, minHeight: 38 }, '& .MuiInputLabel-root': { fontSize: 11 }, '& .MuiSelect-select': { py: 1, pr: '26px !important' } }}>
              {!antenna && <MenuItem value={entry.antennaId} disabled sx={{ fontSize: 12 }}>Unavailable antenna</MenuItem>}
              {antennas.map(option => <MenuItem key={option.id} value={option.id} disabled={draft.some(other => other.key !== entry.key && other.antennaId === option.id)} sx={{ fontSize: 12 }}>{option.name}</MenuItem>)}
            </TextField>
            <TextField required size="small" type="number" label="Count" value={entry.count} error={invalidCount} onChange={event => update(entry.key, { count: event.target.value })} slotProps={{ htmlInput: { 'aria-label': `Antenna count ${index + 1}`, min: 1, max: 100, step: 1 } }} sx={{ minWidth: 0, '& .MuiInputBase-root': { fontSize: 12, minHeight: 38 }, '& .MuiInputLabel-root': { fontSize: 11 }, '& .MuiInputBase-input': { px: 1, py: 1 } }} />
            <IconButton size="small" aria-label={`Remove antenna ${index + 1}`} onClick={() => setDraft(previous => previous.filter(other => other.key !== entry.key))} sx={{ width: 30, height: 32 }}><CloseRounded sx={{ fontSize: 17 }} /></IconButton>
            {antenna && <Typography sx={{ gridColumn: '1 / -1', fontSize: 10.5, lineHeight: 1.35, color: 'text.secondary', overflowWrap: 'anywhere' }}>
              Power {formatPower(antenna.power)} · {!antenna.combinable ? 'Does not combine' : antenna.combinabilityExponent === 1 ? 'Combines linearly' : 'Combines with diminishing returns'}
            </Typography>}
            {invalidCount && <Typography sx={{ gridColumn: '1 / -1', fontSize: 10.5, lineHeight: 1.35, color: 'error.main' }}>Enter a whole count from 1 to 100.</Typography>}
          </Box>
        })}
      </Box>
    </DialogContent>
    <Box sx={{ px: 1.5, pb: .5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
      <Button size="small" startIcon={<AddRounded sx={{ fontSize: '17px !important' }} />} onClick={add} disabled={atLimit} sx={{ minHeight: 32, px: .5, fontSize: 12 }}>Add antenna</Button>
      <Typography sx={{ fontSize: 10.5, color: 'text.secondary', whiteSpace: 'nowrap' }}>Up to 100 per craft</Typography>
    </Box>
    <Box sx={{ px: 1.5, py: .75, borderTop: '1px solid', borderColor: 'divider', bgcolor: '#080f2135', minWidth: 0 }}>
      <Stack direction="row" sx={{ alignItems: 'baseline', justifyContent: 'space-between', gap: .75, minWidth: 0 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontSize: 10.5, color: 'text.secondary' }}>Effective antenna power</Typography>
          <Typography component="output" data-testid="antenna-array-power" title={result.status === 'success' ? `${exactFormat.format(result.effectivePower)} m` : undefined} aria-live="polite" sx={{ display: 'block', fontSize: 22, lineHeight: 1.2, color: '#a5e4d5', fontWeight: 500, fontVariantNumeric: 'tabular-nums', overflowWrap: 'anywhere' }}>{result.status === 'success' ? formatPower(result.effectivePower) : '—'}</Typography>
        </Box>
        <Typography sx={{ flexShrink: 0, fontSize: 11, color: 'text.secondary', whiteSpace: 'nowrap' }}><Box component="output" data-testid="antenna-array-count">{result.status === 'success' ? result.totalCount : '—'}</Box> antennas</Typography>
      </Stack>
      {result.status === 'invalid' ? <Typography role="status" sx={{ mt: .5, fontSize: 11, lineHeight: 1.35, color: 'secondary.main', overflowWrap: 'anywhere' }}>{result.errors[0]}</Typography>
        : <Typography sx={{ mt: .5, fontSize: 10.5, lineHeight: 1.35, color: 'text.secondary' }}>Only combinable antennas add to the combined power. Non-combining parts can provide their own single-antenna power.</Typography>}
    </Box>
    <DialogActions sx={{ px: 1.5, py: .75, gap: .5 }}>
      <Button size="small" onClick={onClose} sx={{ minHeight: 36, px: 1.25, fontSize: 12 }}>Cancel</Button>
      <Button size="small" variant="contained" disabled={result.status !== 'success'} onClick={() => { if (result.status === 'success') onApply(parsed) }} sx={{ minHeight: 36, minWidth: 64, px: 1.5, fontSize: 12 }}>Apply</Button>
    </DialogActions>
  </>
}

export default function AntennaArrayDialog({ open, role, entries, onApply, onClose }: AntennaArrayDialogProps) {
  const id = useId().replace(/:/g, '')
  const headingId = `${id}-antenna-array-heading`
  const descriptionId = `${id}-antenna-array-description`
  return <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" aria-labelledby={headingId} aria-describedby={descriptionId} sx={{ '& .MuiDialog-paper': { m: 1, width: 'calc(100% - 16px)', maxHeight: 'calc(100dvh - 16px)' } }}>
    <ArrayContent key={`${role}:${open}`} role={role} entries={entries} onApply={onApply} onClose={onClose} headingId={headingId} descriptionId={descriptionId} />
  </Dialog>
}
