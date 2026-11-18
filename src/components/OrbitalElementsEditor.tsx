import { Box, Button, InputAdornment, MenuItem, Stack, TextField, Typography } from '@mui/material'
import type { OrbitalBody, OrbitalElements } from '../types/orbital'
import { orbitalDraftValue, orbitalElementFields, validOrbitalDraft, type OrbitalOverrideDrafts } from '../utils/orbitalOverrides'

interface Props {
  bodies: readonly OrbitalBody[]
  bodyAId: string
  bodyBId: string
  drafts: OrbitalOverrideDrafts
  selection: string
  onSelectionChange: (selection: string) => void
  onChange: (bodyId: string, key: keyof OrbitalElements, value: string) => void
  onRestore: (bodyId?: string) => void
}

const fieldStyles = {
  minWidth: 0,
  '& .MuiInputBase-root': { fontSize: 13, minHeight: 40 },
  '& .MuiInputLabel-root': { fontSize: 15 },
  '& .MuiFormHelperText-root': { mx: 0, fontSize: 12, lineHeight: 1.4 },
} as const

export default function OrbitalElementsEditor({ bodies, bodyAId, bodyBId, drafts, selection, onSelectionChange, onChange, onRestore }: Props) {
  const bodyId = selection === 'a' ? bodyAId : selection === 'b' ? bodyBId : selection
  const body = bodies.find(candidate => candidate.id === bodyId)
  return <Box component="details" sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, px: 1, py: .75, bgcolor: '#080f2125', minWidth: 0 }}>
    <Box component="summary" sx={{ cursor: 'pointer', minHeight: 28, fontSize: 12, color: 'primary.light' }}>Orbital elements and overrides{Object.keys(drafts).length > 0 ? ' · customized' : ''}</Box>
    <Stack spacing={1.5} sx={{ pt: 1.25 }}>
      <TextField select fullWidth size="small" label="Orbital data body" value={selection} onChange={event => onSelectionChange(event.target.value)} sx={fieldStyles}>
        <MenuItem value="a" sx={{ fontSize: 13 }}>A · {bodies.find(candidate => candidate.id === bodyAId)?.name ?? 'Endpoint A'}</MenuItem>
        <MenuItem value="b" sx={{ fontSize: 13 }}>B · {bodies.find(candidate => candidate.id === bodyBId)?.name ?? 'Endpoint B'}</MenuItem>
        {bodies.filter(candidate => candidate.parentBodyId !== null && candidate.id !== bodyAId && candidate.id !== bodyBId)
          .map(candidate => <MenuItem key={candidate.id} value={candidate.id} sx={{ fontSize: 13 }}>{candidate.name ?? candidate.id}</MenuItem>)}
      </TextField>
      <Typography sx={{ fontSize: 12, lineHeight: 1.4, color: 'text.secondary' }}>Angles describe the source reference plane. Mean anomaly is shown in degrees; epochs and periods are seconds. Empty source values are unknown, not zero. Edits affect Signals only.</Typography>
      {body && <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', columnGap: 1, rowGap: 1.5 }}>
        {orbitalElementFields.map(field => {
          const value = orbitalDraftValue(body, field.key, drafts)
          const edited = drafts[body.id]?.[field.key] !== undefined
          const invalid = edited && !validOrbitalDraft(field.key, value)
          return <TextField key={field.key} fullWidth size="small" type="number" label={field.label} value={value} error={invalid}
            onChange={event => onChange(body.id, field.key, event.target.value)}
            helperText={invalid ? field.key === 'eccentricity' ? 'Use 0 ≤ e < 1.' : field.key === 'inclinationDeg' ? 'Use 0–180°.' : 'Enter a finite, valid value.' : value === '' ? 'Unknown in source' : undefined}
            slotProps={{ htmlInput: { 'aria-label': field.label, step: 'any' }, input: field.unit ? { endAdornment: <InputAdornment position="end"><Typography sx={{ fontSize: 12 }}>{field.unit}</Typography></InputAdornment> } : undefined }} sx={fieldStyles} />
        })}
      </Box>}
      <Stack direction="row" sx={{ flexWrap: 'wrap', gap: .5 }}>
        <Button size="small" disabled={!body || !drafts[body.id]} onClick={() => { if (body) onRestore(body.id) }} sx={{ fontSize: 12, minHeight: 32 }}>Restore this body</Button>
        <Button size="small" disabled={Object.keys(drafts).length === 0} onClick={() => onRestore()} sx={{ fontSize: 12, minHeight: 32 }}>Restore all orbital data</Button>
      </Stack>
    </Stack>
  </Box>
}
