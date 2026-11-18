import { useState } from 'react'
import { Box, Button, InputAdornment, Slider, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material'
import type { OrbitalPositionMode, OrbitalSignalSweep } from '../types/orbital'
import { gameDateToUT, utToGameDate, type CalendarKind } from '../utils/gameTime'

interface Props {
  mode: OrbitalPositionMode
  onModeChange: (mode: OrbitalPositionMode) => void
  phase: number
  onPhaseChange: (phase: number) => void
  ut: string
  onUTChange: (ut: string) => void
  onNavigateUT: (ut: string) => void
  calendar: CalendarKind
  advanced: boolean
  referenceAngle: string
  onReferenceAngleChange: (angle: string) => void
  sweep: OrbitalSignalSweep | null
  nameA: string
  circular: boolean
  manualOrbits: boolean
}

const number = new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 })
const styles = {
  minWidth: 0,
  '& .MuiInputBase-root': { fontSize: 13, minHeight: 40 },
  '& .MuiInputLabel-root': { fontSize: 15 },
  '& .MuiFormHelperText-root': { mx: 0, fontSize: 12, lineHeight: 1.4 },
} as const

function dateDraft(ut: string, calendar: CalendarKind) {
  const date = ut.trim() === '' ? null : utToGameDate(Math.round(Number(ut) * 1000) / 1000, calendar)
  if (!date) return { year: '', day: '', time: '' }
  const seconds = date.second.toFixed(3).replace(/\.?0+$/, '')
  return {
    year: String(date.year), day: String(date.day),
    time: `${String(date.hour).padStart(2, '0')}:${String(date.minute).padStart(2, '0')}:${Number(seconds) < 10 ? '0' : ''}${seconds}`,
  }
}

export default function SignalPositionControls({ mode, onModeChange, phase, onPhaseChange, ut, onUTChange, onNavigateUT, calendar, advanced, referenceAngle, onReferenceAngleChange, sweep, nameA, circular, manualOrbits }: Props) {
  const [draft, setDraft] = useState(() => ({ ut, calendar, ...dateDraft(ut, calendar), errors: [] as string[] }))
  if (draft.ut !== ut || draft.calendar !== calendar) setDraft({ ut, calendar, ...dateDraft(ut, calendar), errors: [] })

  function changeDate(field: 'year' | 'day' | 'time', value: string) {
    const next = { ...draft, [field]: value }
    const time = /^(\d{1,2}):(\d{2})(?::(\d{2}(?:\.\d+)?))?$/.exec(next.time)
    const result = gameDateToUT({
      year: next.year.trim() ? Number(next.year) : NaN,
      day: next.day.trim() ? Number(next.day) : NaN,
      hour: time ? Number(time[1]) : NaN,
      minute: time ? Number(time[2]) : NaN,
      second: time ? Number(time[3] ?? 0) : NaN,
    }, calendar)
    const nextUT = result.status === 'success' ? String(result.utS) : ''
    setDraft({ ...next, ut: nextUT, errors: result.status === 'invalid' ? result.errors : [] })
    onUTChange(nextUT)
  }

  function navigate(which: 'closest' | 'farthest') {
    if (!sweep) return
    if (mode === 'date') onNavigateUT(String(sweep[which].parameter))
    else onPhaseChange(sweep[which].parameter)
  }

  return <Stack spacing={.75} sx={{ minWidth: 0 }}>
    <ToggleButtonGroup exclusive fullWidth size="small" value={mode} aria-label="Planet position mode"
      onChange={(_, value: OrbitalPositionMode | null) => { if (value) onModeChange(value) }}
      sx={{ '& .MuiToggleButton-root': { minHeight: 36, textTransform: 'none', fontSize: 12, px: 1 } }}>
      <ToggleButton value="phase">Relative phase</ToggleButton>
      <ToggleButton value="date" disabled={manualOrbits}>In-game date</ToggleButton>
    </ToggleButtonGroup>
    {manualOrbits && <Typography sx={{ fontSize: 12, lineHeight: 1.4, color: 'text.secondary' }}>Manual radii define a phase sweep only. Date predictions need the orbital timing data available under Actual orbits.</Typography>}
    <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', gap: .5 }}>
      <Typography component={mode === 'phase' ? 'label' : 'span'} htmlFor={mode === 'phase' ? 'signal-phase-slider' : undefined} sx={{ minWidth: 0, fontSize: 13, lineHeight: 1.4 }}>
        {mode === 'phase' ? 'Planet positions' : 'Selected in-game date'}
        {mode === 'phase' && <Box component="span" sx={{ display: 'inline-block', fontSize: 12, color: 'text.secondary' }}> · {number.format(phase)}° relative phase</Box>}
      </Typography>
      <Stack direction="row" spacing={.25} sx={{ flexShrink: 0 }}>
        <Button size="small" disabled={!sweep} onClick={() => navigate('closest')} sx={{ minHeight: 32, minWidth: 0, px: .75, fontSize: 12 }}>Closest</Button>
        <Button size="small" disabled={!sweep} onClick={() => navigate('farthest')} sx={{ minHeight: 32, minWidth: 0, px: .75, fontSize: 12 }}>{circular ? 'Opposite' : 'Farthest'}</Button>
      </Stack>
    </Stack>
    {mode === 'phase' ? <>
      <Slider id="signal-phase-slider" aria-label="Planet positions" value={phase} min={0} max={360} step={1}
        onChange={(_, value) => { if (typeof value === 'number') onPhaseChange(value) }}
        getAriaValueText={value => `${number.format(value)} degrees relative phase`} valueLabelDisplay="auto" valueLabelFormat={value => `${number.format(value)}°`}
        // Leave room for the preceding signal/distance feedback when browsers
        // scroll the focused thumb into a short dialog's visible content area.
        sx={{ display: 'block', width: 'calc(100% - 16px)', mx: '8px', py: 1.5, '& input': { scrollMarginBlockStart: '40px' } }} />
      <Typography sx={{ fontSize: 12, lineHeight: 1.4, color: 'text.secondary' }}>
        {circular ? 'Circular reference positions; no in-game date is implied.' : `${nameA} stays at its reference position while the other body moves around its orbit. These are selected positions, not an in-game date.`}
      </Typography>
      {advanced && !circular && <TextField fullWidth size="small" type="number" label="Planet A reference angle" value={referenceAngle}
        onChange={event => onReferenceAngleChange(event.target.value)} error={referenceAngle.trim() === '' || !Number.isFinite(Number(referenceAngle))}
        helperText="True anomaly from A’s periapsis. The default 0° holds A at periapsis. B’s true anomaly equals this angle plus relative phase."
        slotProps={{ htmlInput: { 'aria-label': 'Planet A reference angle', step: 'any' }, input: { endAdornment: <InputAdornment position="end">°</InputAdornment> } }} sx={styles} />}
    </> : <>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, .8fr) minmax(0, .75fr) minmax(0, 1.3fr)', gap: 1 }}>
        <TextField size="small" type="number" label="Year" value={draft.year} onChange={event => changeDate('year', event.target.value)} error={draft.errors.length > 0}
          slotProps={{ htmlInput: { 'aria-label': 'In-game year', min: 1, max: 9999, step: 1 } }} sx={styles} />
        <TextField size="small" type="number" label="Day" value={draft.day} onChange={event => changeDate('day', event.target.value)} error={draft.errors.length > 0}
          slotProps={{ htmlInput: { 'aria-label': 'In-game day', min: 1, max: calendar === 'kerbin' ? 426 : 366, step: 1 } }} sx={styles} />
        <TextField size="small" label="Time" value={draft.time} onChange={event => changeDate('time', event.target.value)} error={draft.errors.length > 0}
          placeholder="HH:MM:SS" slotProps={{ htmlInput: { 'aria-label': 'In-game time' } }} sx={styles} />
      </Box>
      {draft.errors.length > 0 && <Typography role="alert" sx={{ fontSize: 12, lineHeight: 1.4, color: 'error.main' }}>{draft.errors[0]}</Typography>}
      <Typography sx={{ fontSize: 12, lineHeight: 1.4, color: 'text.secondary' }}>
        {calendar === 'kerbin' ? 'Kerbin calendar: 6-hour days, 426 days per year. UT 0 is Year 1, Day 1, 00:00:00.' : 'RSS Earth calendar: 24-hour days and Gregorian leap years. UT 0 is 1951, Day 1, 00:00:00 TAI.'}
        {' '}Time uses HH:MM:SS; no save-file positions are imported.
      </Typography>
    </>}
    {advanced && <TextField fullWidth size="small" type="number" label={mode === 'date' ? 'Universal time' : 'Ancestor reference UT'} value={ut}
      onChange={event => onUTChange(event.target.value)} error={ut.trim() === '' || !Number.isFinite(Number(ut))}
      helperText={mode === 'date' ? 'Exact game UT in seconds. Changing this also updates the date inputs.' : 'Ancestor orbits stay at this UT during the selected phase sweep.'}
      slotProps={{ htmlInput: { 'aria-label': 'Universal time', step: 'any' }, input: { endAdornment: <InputAdornment position="end">s</InputAdornment> } }} sx={styles} />}
  </Stack>
}
