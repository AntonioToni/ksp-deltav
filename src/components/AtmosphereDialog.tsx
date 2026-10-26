import { useState } from 'react'
import {
  Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle,
  InputAdornment, Stack, TextField, Typography,
} from '@mui/material'
import type { PlanetPack } from '../types/planner'
import {
  getAtmosphericCapabilities,
  type AtmosphericBodyPlan,
  type AtmosphericPlan,
} from '../utils/atmosphericAssistance'

interface AtmosphereDialogProps {
  open: boolean
  pack: PlanetPack
  plan: AtmosphericPlan
  onApply: (plan: AtmosphericPlan) => void
  onClose: () => void
}

interface DraftBodyPlan {
  bodyId: string
  capture: boolean
  landing: boolean
  landingText: string
}

function validAllowance(text: string): boolean {
  const value = Number(text)
  return text.trim() !== '' && Number.isFinite(value) && value >= 0 && value <= 1_000_000
}

function AtmosphereContent({ pack, plan, onApply, onClose }: Omit<AtmosphereDialogProps, 'open'>) {
  const capabilities = getAtmosphericCapabilities(pack)
  const [draft, setDraft] = useState<DraftBodyPlan[]>(() => capabilities.map(({ body, capture, landing }) => {
    const existing = plan.find(entry => entry.bodyId === body.id)
    return {
      bodyId: body.id,
      capture: capture && existing?.capture === true,
      landing: landing && existing?.landing === true,
      landingText: existing?.landing === true ? String(existing.landingDeltaV) : '',
    }
  }))
  const valid = draft.every(entry => !entry.landing || validAllowance(entry.landingText))

  function updateBody(id: string, changes: Partial<Omit<DraftBodyPlan, 'bodyId'>>) {
    setDraft(entries => entries.map(entry => entry.bodyId === id ? { ...entry, ...changes } : entry))
  }

  function apply() {
    if (!valid) return
    const next: AtmosphericBodyPlan[] = draft.filter(entry => entry.capture || entry.landing).map(entry => ({
      bodyId: entry.bodyId,
      capture: entry.capture,
      landing: entry.landing,
      landingDeltaV: entry.landing ? Number(entry.landingText) : 0,
    }))
    onApply(next)
  }

  return <>
    <DialogTitle id="atmosphere-heading" sx={{ px: 1.5, py: 1, fontSize: 16, lineHeight: 1.5 }}>Atmospheric assistance</DialogTitle>
    <Box id="atmosphere-description" sx={{ px: 1.5, pb: 1 }}>
      <Typography sx={{ fontSize: 12, lineHeight: 1.4, color: 'text.secondary' }}>
        Ideal capture uses 0 m/s for standalone capture and circularization burns; cleanup burns are excluded. Landing uses the powered allowance you enter.
      </Typography>
      <Typography sx={{ mt: .5, fontSize: 11, lineHeight: 1.4, color: 'text.secondary' }}>
        Entry heating, guidance, and parachute performance are not simulated. Bundled transfer costs stay in the budget, even where arrows show atmospheric braking.
      </Typography>
    </Box>
    {capabilities.length > 0 && <Box aria-hidden="true" sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 90px 76px', mx: 1.5, px: 1, py: .5, borderBottom: '1px solid', borderColor: 'divider', fontSize: 10, lineHeight: 1.2, color: 'text.secondary' }}>
      <Box>Body</Box><Box sx={{ textAlign: 'center' }}>Ideal capture</Box><Box sx={{ textAlign: 'center' }}>Landing</Box>
    </Box>}
    <DialogContent sx={{ px: 1.5, pt: .75, pb: .75, minWidth: 0, minHeight: 0, overflowY: 'auto' }}>
      {capabilities.length === 0 && <Typography sx={{ fontSize: 12, color: 'text.secondary', py: 1 }}>
        This pack has no supported standalone atmospheric capture or landing maneuvers.
      </Typography>}
      <Box component="ul" aria-label="Atmospheric body options" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: .5 }}>
        {capabilities.map(({ body, capture, landing }) => {
          const entry = draft.find(candidate => candidate.bodyId === body.id)!
          const invalid = entry.landing && !validAllowance(entry.landingText)
          return <Box component="li" key={body.id} sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 90px 76px', alignItems: 'center', px: 1, py: .5, border: '1px solid', borderColor: entry.capture || entry.landing ? '#8fcdbd65' : 'divider', borderRadius: 1, bgcolor: entry.capture || entry.landing ? '#8fcdbd08' : '#ffffff03', minWidth: 0 }}>
            <Stack direction="row" sx={{ gap: .75, alignItems: 'center', minWidth: 0 }}>
              <Box component="span" sx={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, bgcolor: body.color }} />
              <Typography component="h3" sx={{ fontSize: 12, lineHeight: 1.35, fontWeight: 500, overflowWrap: 'anywhere' }}>{body.name}</Typography>
            </Stack>
            {capture ? <Checkbox size="small" checked={entry.capture} onChange={(_, checked) => updateBody(body.id, { capture: checked })} slotProps={{ input: { 'aria-label': `Ideal capture at ${body.name}` } }} sx={{ justifySelf: 'center', p: .5, '& .MuiSvgIcon-root': { fontSize: 20 } }} />
              : <Typography aria-label={`Capture not available at ${body.name}`} sx={{ textAlign: 'center', fontSize: 12, color: 'text.secondary' }}>—</Typography>}
            {landing ? <Checkbox size="small" checked={entry.landing} onChange={(_, checked) => updateBody(body.id, { landing: checked })} slotProps={{ input: { 'aria-label': `Atmospheric landing at ${body.name}` } }} sx={{ justifySelf: 'center', p: .5, '& .MuiSvgIcon-root': { fontSize: 20 } }} />
              : <Typography aria-label={`Landing not available at ${body.name}`} sx={{ textAlign: 'center', fontSize: 12, color: 'text.secondary' }}>—</Typography>}
            {entry.landing && <TextField required fullWidth size="small" type="number" label={`Landing allowance at ${body.name}`} value={entry.landingText} error={entry.landingText !== '' && invalid} onChange={event => updateBody(body.id, { landingText: event.target.value })} helperText={invalid ? 'Enter 0–1,000,000 m/s. Zero is a fully atmospheric landing.' : 'Replaces the reference allowance for each selected descent.'} slotProps={{
              htmlInput: { 'aria-label': `Landing allowance at ${body.name}`, min: 0, max: 1_000_000, step: 'any' },
              input: { endAdornment: <InputAdornment position="end"><Typography sx={{ fontSize: 11 }}>m/s</Typography></InputAdornment> },
            }} sx={{ gridColumn: '1 / -1', mt: 1, mb: .25, '& .MuiInputBase-root': { fontSize: 12 }, '& .MuiInputLabel-root': { fontSize: 12 }, '& .MuiFormHelperText-root': { mx: 0, fontSize: 10, lineHeight: 1.35 } }} />}
          </Box>
        })}
      </Box>
    </DialogContent>
    <DialogActions sx={{ px: 1.5, py: .75, gap: .5, justifyContent: 'space-between' }}>
      <Button size="small" onClick={() => setDraft(entries => entries.map(entry => ({ ...entry, capture: false, landing: false, landingText: '' })))} sx={{ minHeight: 36, minWidth: 0, px: .75, fontSize: 11 }}>Disable all</Button>
      <Stack direction="row" spacing={.5}>
        <Button size="small" onClick={onClose} sx={{ minHeight: 36, minWidth: 0, px: 1.25, fontSize: 12 }}>Cancel</Button>
        <Button size="small" variant="contained" disabled={!valid} onClick={apply} sx={{ minHeight: 36, minWidth: 64, px: 1.5, fontSize: 12 }}>Apply</Button>
      </Stack>
    </DialogActions>
  </>
}

export default function AtmosphereDialog({ open, pack, plan, onApply, onClose }: AtmosphereDialogProps) {
  return <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" aria-labelledby="atmosphere-heading" aria-describedby="atmosphere-description" sx={{ '& .MuiDialog-paper': { m: 1, width: 'calc(100% - 16px)', maxHeight: 'calc(100dvh - 16px)' } }}>
    <AtmosphereContent key={`${pack.id}:${open}`} pack={pack} plan={plan} onApply={onApply} onClose={onClose} />
  </Dialog>
}
