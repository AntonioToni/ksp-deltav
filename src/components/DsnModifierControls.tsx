import { Alert, Button, InputAdornment, TextField, Typography } from '@mui/material'
import { MAX_DSN_MODIFIER } from '../data/radioProfiles'

interface DsnModifierControlsProps {
  value: string
  onChange: (value: string) => void
}

export function DsnModifierWarning({ onEdit }: { onEdit?: () => void }) {
  return <Alert severity="warning" sx={{ fontSize: 12, '& .MuiAlert-message': { minWidth: 0 } }}>
    <Typography sx={{ fontSize: 12, lineHeight: 1.45 }}>Enter a valid DSN modifier to calculate ground-station links and automatic Kerbalism transmission efficiency.</Typography>
    {onEdit && <Button size="small" onClick={onEdit} sx={{ mt: .5, minHeight: 32, fontSize: 12 }}>Edit DSN modifier in Advanced mode</Button>}
  </Alert>
}

/** PBC recommends a save setting; it does not patch ground-station powers. */
export default function DsnModifierControls({ value, onChange }: DsnModifierControlsProps) {
  const modifier = value.trim() === '' ? NaN : Number(value)
  const invalid = !Number.isFinite(modifier) || modifier <= 0 || modifier > MAX_DSN_MODIFIER
  return <TextField fullWidth size="small" type="number" label="DSN modifier" value={value}
    error={invalid} onChange={event => onChange(event.target.value)}
    helperText={invalid ? `Enter a multiplier greater than 0, up to ${MAX_DSN_MODIFIER}.` : 'Match your save’s DSN Modifier. PBC recommends 0.35×; 1× keeps stock ground-station powers. This scales DSN presets only, separately from Range multiplier. Custom effective powers stay as entered.'}
    slotProps={{
      htmlInput: { 'aria-label': 'DSN modifier', min: Number.MIN_VALUE, max: MAX_DSN_MODIFIER, step: 'any' },
      input: { endAdornment: <InputAdornment position="end"><Typography sx={{ fontSize: 13 }}>×</Typography></InputAdornment> },
    }} sx={{
      minWidth: 0, mt: .5,
      '& .MuiInputBase-root': { fontSize: 13, minHeight: 40 },
      '& .MuiInputLabel-root': { fontSize: 16 },
      '& .MuiOutlinedInput-notchedOutline legend': { fontSize: 12 },
      '& .MuiFormHelperText-root': { mx: 0, fontSize: 12, lineHeight: 1.4 },
    }} />
}
