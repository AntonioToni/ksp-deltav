import { useMemo, useState } from 'react'
import {
  Accordion, AccordionDetails, AccordionSummary, Box, Button, Checkbox, Dialog,
  DialogActions, DialogContent, DialogTitle, FormControlLabel, IconButton,
  InputAdornment, MenuItem, Radio, RadioGroup, Stack, TextField, Tooltip, Typography,
} from '@mui/material'
import AirRounded from '@mui/icons-material/AirRounded'
import CloseRounded from '@mui/icons-material/CloseRounded'
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded'
import ParaglidingRounded from '@mui/icons-material/ParaglidingRounded'
import type { PlanetPack } from '../types/planner'
import { getAtmosphericCapabilities, getDefaultAtmosphericPlan, type AtmosphericPlan } from '../utils/atmosphericAssistance'
import {
  atmosphericChoicesValid, createAtmosphericChoices, referenceLandingBudgets,
  toAtmosphericPlan, type AtmosphericChoice, type LandingMethod,
} from '../utils/atmosphericChoices'

interface AtmosphereDialogProps {
  open: boolean
  pack: PlanetPack
  plan: AtmosphericPlan
  isBuiltIn: boolean
  initialBodyId?: string | null
  onApply: (plan: AtmosphericPlan) => void
  onClose: () => void
}

const format = new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 })
const fieldStyles = {
  minWidth: 0,
  '& .MuiInputBase-root': { fontSize: 13, minHeight: 44 },
  '& .MuiInputLabel-root': { fontSize: 12 },
  '& .MuiFormHelperText-root': { mx: 0, fontSize: 11, lineHeight: 1.4 },
} as const

function customValueValid(text: string): boolean {
  const value = Number(text)
  return text.trim() !== '' && Number.isFinite(value) && value >= 0 && value <= 1_000_000
}

function AtmosphereContent({ pack, plan, isBuiltIn, initialBodyId, onApply, onClose }: Omit<AtmosphereDialogProps, 'open'>) {
  const capabilities = useMemo(() => getAtmosphericCapabilities(pack), [pack])
  const defaults = useMemo(() => getDefaultAtmosphericPlan(pack, isBuiltIn), [pack, isBuiltIn])
  const defaultBodies = useMemo(() => new Set(defaults.map(option => option.bodyId)), [defaults])
  const [draft, setDraft] = useState<AtmosphericChoice[]>(() => createAtmosphericChoices(pack, plan))
  const [bodyId, setBodyId] = useState(() => capabilities.find(option => option.body.id === initialBodyId)?.body.id
    ?? defaults[0]?.bodyId ?? capabilities[0]?.body.id ?? '')
  const [captureExpanded, setCaptureExpanded] = useState(() => new Map(capabilities.map(option => [
    option.body.id, !option.landing || draft.some(choice => choice.bodyId === option.body.id && choice.capture),
  ])))
  const capability = capabilities.find(option => option.body.id === bodyId)
  const selected = draft.find(choice => choice.bodyId === bodyId)
  const budgets = useMemo(() => referenceLandingBudgets(pack, bodyId), [pack, bodyId])
  const referenceCost = budgets.length === 1 ? `${format.format(budgets[0]!)} m/s`
    : budgets.length > 1 ? `${format.format(budgets[0]!)}–${format.format(budgets.at(-1)!)} m/s` : null
  const invalidChoices = draft.filter(choice => choice.landingMethod === 'custom' && !customValueValid(choice.customLandingText))
  const valid = atmosphericChoicesValid(draft)
  const invalidElsewhere = invalidChoices.find(choice => choice.bodyId !== bodyId)
  const invalidBodyName = capabilities.find(option => option.body.id === invalidElsewhere?.bodyId)?.body.name
  const selectedInvalid = selected?.landingMethod === 'custom' && !customValueValid(selected.customLandingText)
  const referenceActionDescription = "Stage every body's original landing and capture budgets. Apply saves these changes."
  const defaultsActionDescription = defaults.length
    ? 'Stage recommended settings for all bodies, including atmospheric Kerbin landing. Apply saves these changes.'
    : 'Stage original landing budgets and capture off for all bodies. Apply saves these changes.'

  function update(changes: Partial<Omit<AtmosphericChoice, 'bodyId'>>) {
    setDraft(choices => choices.map(choice => choice.bodyId === bodyId ? { ...choice, ...changes } : choice))
  }

  function restoreDefaults() {
    const restored = createAtmosphericChoices(pack, defaults)
    setDraft(restored)
    setCaptureExpanded(new Map(capabilities.map(option => [option.body.id, !option.landing])))
  }

  function summary(choice: AtmosphericChoice | undefined): string {
    if (!choice) return 'Map budget'
    const landing = choice.landingMethod === 'atmospheric' ? defaultBodies.has(choice.bodyId) && !choice.capture ? 'Default · 0 m/s' : 'Atmospheric · 0 m/s'
      : choice.landingMethod === 'custom' ? customValueValid(choice.customLandingText) ? `Custom · ${format.format(Number(choice.customLandingText))} m/s` : 'Check value'
        : 'Map budget'
    const supportsLanding = capabilities.find(option => option.body.id === choice.bodyId)?.landing
    return supportsLanding ? `${landing}${choice.capture ? ' · Capture on' : ''}` : choice.capture ? 'Capture on' : 'Capture off'
  }

  const methods: { value: LandingMethod; label: string; description: string }[] = [
    { value: 'atmospheric', label: 'Atmospheric landing (0 m/s)', description: 'Use atmospheric braking and parachutes without a landing engine burn.' },
    { value: 'custom', label: 'Custom powered landing', description: 'Enter the Delta-V you expect to use for landing.' },
    { value: 'reference', label: 'Use reference map budget', description: isBuiltIn ? 'Use the original landing cost supplied by the map.' : 'Use the original landing cost supplied by this pack.' },
  ]

  return <>
    <DialogTitle id="atmosphere-title-row" sx={{ px: 1.5, py: 1, display: 'flex', alignItems: 'center', gap: .75, fontSize: 16, lineHeight: 1.5, flexShrink: 0 }}>
      <ParaglidingRounded sx={{ fontSize: 21, color: 'primary.main' }} />
      <Box id="atmosphere-heading" component="span" sx={{ flex: 1, minWidth: 0 }}>Landing &amp; Capture</Box>
      <IconButton size="small" aria-label="Close landing and capture" onClick={onClose} sx={{ minWidth: 32, minHeight: 32 }}><CloseRounded sx={{ fontSize: 19 }} /></IconButton>
    </DialogTitle>
    <DialogContent sx={{ px: 1.5, pt: '.25rem !important', pb: 1.25, minWidth: 0, minHeight: 0, overflowY: 'auto' }}>
      <Typography id="atmosphere-description" sx={{ fontSize: 12, lineHeight: 1.45, color: 'text.secondary', mb: 1.75 }}>
        Choose how your spacecraft slows down when entering orbit or landing. These choices adjust the Delta-V for supported maneuvers.
      </Typography>
      {capabilities.length === 0 ? <Typography sx={{ fontSize: 12, color: 'text.secondary', py: 1 }}>
        This pack has no separate atmospheric arrival or landing burns that these options can change.
      </Typography> : <>
        <TextField select fullWidth size="small" label="Atmospheric body" value={bodyId} onChange={event => setBodyId(event.target.value)} sx={{ ...fieldStyles, mb: 1.5 }}
          slotProps={{ select: {
            renderValue: () => <Box sx={{ display: 'flex', alignItems: 'center', gap: .75, minWidth: 0 }}>
              <Box component="span" sx={{ width: 7, height: 7, flexShrink: 0, borderRadius: '50%', bgcolor: capability?.body.color }} />
              <Box component="span" sx={{ minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{capability?.body.name}</Box>
              <Typography component="span" sx={{ maxWidth: '55%', color: selected?.landingMethod === 'reference' && !selected.capture ? 'text.secondary' : '#92d5c6', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis' }}>{summary(selected)}</Typography>
            </Box>,
            MenuProps: { slotProps: { paper: { sx: { maxWidth: 'calc(100vw - 24px)' } } } },
          } }}>
          {capabilities.map(option => <MenuItem key={option.body.id} value={option.body.id} aria-label={option.body.name} aria-description={summary(draft.find(choice => choice.bodyId === option.body.id))} sx={{ minWidth: 0, maxWidth: 'calc(100vw - 32px)', minHeight: 44, gap: 1, fontSize: 13 }}>
            <Box component="span" sx={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, bgcolor: option.body.color }} />
            <Box component="span" sx={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{option.body.name}</Box>
            <Typography component="span" sx={{ color: 'text.secondary', fontSize: 11, maxWidth: '60%', overflow: 'hidden', textOverflow: 'ellipsis' }}>{summary(draft.find(choice => choice.bodyId === option.body.id))}</Typography>
          </MenuItem>)}
        </TextField>
        {capability && selected && <Stack spacing={1.25}>
          {capability.landing && <Box component="section" aria-labelledby="atmospheric-landing-heading">
            <Typography id="atmospheric-landing-heading" component="h3" sx={{ mb: .75, fontSize: 14, fontWeight: 600 }}>Atmospheric landing</Typography>
            <RadioGroup value={selected.landingMethod} onChange={(_, value) => update({ landingMethod: value as LandingMethod })} aria-label={`Landing method at ${capability.body.name}`} sx={{ gap: .75 }}>
              {methods.map(method => {
                const active = selected.landingMethod === method.value
                const noteId = `landing-${method.value}-description`
                return <Box key={method.value} sx={{ minWidth: 0, border: '1px solid', borderColor: active ? '#73c8fa80' : 'divider', borderRadius: 1.25, bgcolor: active ? '#73c8fa0a' : '#080f2125', '&:focus-within': { outline: '2px solid #73c8fa', outlineOffset: 1 } }}>
                  <FormControlLabel value={method.value} sx={{ m: 0, px: .5, py: .5, width: '100%', alignItems: 'flex-start', minHeight: 60, '& .MuiFormControlLabel-label': { minWidth: 0, py: .25, pr: .75 } }}
                    control={<Radio size="small" slotProps={{ input: { 'aria-label': method.label, 'aria-describedby': noteId } }} sx={{ p: .75, color: 'text.secondary', '& .MuiSvgIcon-root': { fontSize: 21 } }} />}
                    label={<Box>
                      <Box sx={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', columnGap: .75, rowGap: .125 }}>
                        <Typography component="span" sx={{ fontSize: 12.5, lineHeight: 1.4, fontWeight: active ? 600 : 500, color: active ? 'primary.light' : 'text.primary' }}>{method.label}</Typography>
                        {method.value === 'atmospheric' && defaultBodies.has(bodyId) && <Typography component="span" sx={{ fontSize: 10, color: '#92d5c6' }}>Built-in default</Typography>}
                        {method.value === 'reference' && referenceCost && <Typography component="span" sx={{ fontSize: 11, color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }} title={budgets.length > 1 ? `Reference landing steps: ${budgets.map(value => `${format.format(value)} m/s`).join(', ')}` : undefined}>{referenceCost}</Typography>}
                      </Box>
                      <Typography id={noteId} component="span" sx={{ display: 'block', mt: .125, color: 'text.secondary', fontSize: 11, lineHeight: 1.4 }}>{method.description}</Typography>
                    </Box>} />
                  {method.value === 'custom' && active && <Box sx={{ pl: { xs: 1, sm: 4.5 }, pr: 1, pt: .5, pb: 1 }}>
                    <TextField required fullWidth size="small" type="number" label={`Landing Delta-V at ${capability.body.name}`} value={selected.customLandingText}
                      error={selectedInvalid} onChange={event => update({ customLandingText: event.target.value })}
                      helperText={selectedInvalid ? 'Enter 0–1,000,000 m/s. Zero is allowed.' : 'Your engine-burn budget for each supported landing step.'}
                      sx={fieldStyles} slotProps={{ htmlInput: { 'aria-label': `Landing Delta-V at ${capability.body.name}`, min: 0, max: 1_000_000, step: 'any' }, input: { endAdornment: <InputAdornment position="end"><Typography sx={{ fontSize: 11 }}>m/s</Typography></InputAdornment> } }} />
                  </Box>}
                </Box>
              })}
            </RadioGroup>
            <Typography sx={{ mt: .75, fontSize: 11, lineHeight: 1.4, color: 'text.secondary' }}>A 0 m/s choice is a landing assumption, not a guarantee of safe entry. Deorbit and correction burns are separate.</Typography>
          </Box>}
          {capability.capture && <Accordion disableGutters elevation={0} expanded={captureExpanded.get(bodyId) ?? false} onChange={(_, expanded) => setCaptureExpanded(previous => new Map(previous).set(bodyId, expanded))}
            sx={{ minWidth: 0, border: '1px solid', borderColor: selected.capture ? '#8fcdbd65' : 'divider', borderRadius: '10px !important', bgcolor: selected.capture ? '#8fcdbd08' : '#080f2125', '&:before': { display: 'none' } }}>
            <AccordionSummary aria-label="Orbital capture" aria-controls="orbital-capture-content" id="orbital-capture-heading" expandIcon={<ExpandMoreRounded sx={{ fontSize: 20 }} />} sx={{ px: 1.25, minHeight: 44, '&.Mui-expanded': { minHeight: 44 }, '& .MuiAccordionSummary-content': { my: .75, gap: .75, alignItems: 'center' }, '& .MuiAccordionSummary-content.Mui-expanded': { my: .75 } }}>
              <AirRounded sx={{ fontSize: 18, color: selected.capture ? '#92d5c6' : 'text.secondary' }} />
              <Typography component="h3" sx={{ flex: 1, fontSize: 14, fontWeight: 500 }}>Orbital capture</Typography>
              <Typography component="span" sx={{ fontSize: 11, color: selected.capture ? '#92d5c6' : 'text.secondary' }}>{selected.capture ? 'On' : 'Off'}</Typography>
            </AccordionSummary>
            <AccordionDetails id="orbital-capture-content" sx={{ px: 1.25, pt: 0, pb: 1.25 }}>
              <Typography sx={{ fontSize: 12, color: 'text.secondary', lineHeight: 1.45 }}>Use an atmosphere to slow down into orbit instead of relying entirely on engine burns.</Typography>
              <FormControlLabel sx={{ mx: 0, mt: .5, minHeight: 44, '& .MuiFormControlLabel-label': { fontSize: 12 } }} control={<Checkbox checked={selected.capture} onChange={(_, checked) => update({ capture: checked })} size="small" slotProps={{ input: { 'aria-label': `Ideal capture at ${capability.body.name}` } }} sx={{ pl: 0, pr: 1 }} />} label="Use atmospheric capture (0 m/s)" />
              <Typography sx={{ fontSize: 11, color: 'text.secondary', lineHeight: 1.4 }}>Replaces supported capture burns with 0 m/s of engine burns. Safe entry and any later correction burns are not calculated.</Typography>
            </AccordionDetails>
          </Accordion>}
          <Typography sx={{ fontSize: 10.5, color: 'text.secondary', lineHeight: 1.4 }}>Only separately listed arrival burns can change. Complete transfer budgets keep their original cost.</Typography>
        </Stack>}
      </>}
    </DialogContent>
    <DialogActions sx={{ flexShrink: 0, flexWrap: 'wrap', justifyContent: 'space-between', px: 1.5, py: .75, columnGap: 1, rowGap: .5, borderTop: '1px solid', borderColor: 'divider', bgcolor: '#080f2125', '& > :not(style) ~ :not(style)': { ml: 0 } }}>
      {invalidElsewhere && <Box role="alert" sx={{ display: 'flex', alignItems: 'center', gap: .5, flex: '1 1 100%', minWidth: 0 }}>
        <Typography sx={{ flex: 1, minWidth: 0, fontSize: 11, lineHeight: 1.4, color: 'secondary.main', overflowWrap: 'anywhere' }}>Check landing Delta-V for {invalidBodyName}.</Typography>
        <Button size="small" onClick={() => setBodyId(invalidElsewhere.bodyId)} sx={{ minHeight: 32, fontSize: 11 }}>Review</Button>
      </Box>}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'max-content max-content' }, gap: .5, minWidth: 0, flex: { xs: '1 1 100%', sm: '0 1 auto' } }}>
        <Tooltip describeChild title={referenceActionDescription}>
          <Box component="span" sx={{ display: 'flex', minWidth: 0 }}>
            <Button size="small" disabled={!capabilities.length} aria-description={referenceActionDescription} onClick={() => setDraft(choices => choices.map(choice => ({ ...choice, capture: false, landingMethod: 'reference' })))} sx={{ minHeight: 40, minWidth: 0, width: '100%', px: .75, fontSize: 11, lineHeight: 1.3, whiteSpace: 'normal', textTransform: 'none' }}>Use map budgets for all</Button>
          </Box>
        </Tooltip>
        <Tooltip describeChild title={defaultsActionDescription}>
          <Box component="span" sx={{ display: 'flex', minWidth: 0 }}>
            <Button size="small" disabled={!capabilities.length} aria-description={defaultsActionDescription} onClick={restoreDefaults} sx={{ minHeight: 40, minWidth: 0, width: '100%', px: .75, fontSize: 11, lineHeight: 1.3, whiteSpace: 'normal', textTransform: 'none' }}>Restore recommended defaults</Button>
          </Box>
        </Tooltip>
      </Box>
      <Stack direction="row" spacing={.5} sx={{ flex: { xs: '1 1 100%', sm: '0 1 auto' }, justifyContent: 'flex-end' }}>
        <Button size="small" onClick={onClose} sx={{ minHeight: 40, px: 1.25, fontSize: 12 }}>Cancel</Button>
        <Button size="small" variant="contained" disabled={!valid} onClick={() => { if (valid) onApply(toAtmosphericPlan(pack, draft, isBuiltIn)) }} sx={{ minHeight: 40, minWidth: 72, px: 2, fontSize: 12 }}>Apply</Button>
      </Stack>
    </DialogActions>
  </>
}

export default function AtmosphereDialog({ open, pack, plan, isBuiltIn, initialBodyId, onApply, onClose }: AtmosphereDialogProps) {
  return <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" aria-labelledby="atmosphere-heading" aria-describedby="atmosphere-description" sx={{ '& .MuiDialog-paper': { m: 1, width: 'calc(100% - 16px)', maxHeight: 'calc(100dvh - 16px)' } }}>
    <AtmosphereContent key={`${pack.id}:${open}:${initialBodyId ?? ''}`} pack={pack} plan={plan} isBuiltIn={isBuiltIn} initialBodyId={initialBodyId} onApply={onApply} onClose={onClose} />
  </Dialog>
}
