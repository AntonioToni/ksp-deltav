import { Box, InputAdornment, Stack, TextField, Typography } from '@mui/material'
import { MAX_KERBALISM_ANTENNA_SPEED, MAX_KERBALISM_RATE_BITS_PER_SECOND } from '../utils/kerbalismBitrate'
import { formatBitrate } from '../utils/formatBitrate'

interface KerbalismRateControlsProps {
  antennaSpeed: string
  minimumBitsPerSecond: string
  onSpeedChange: (value: string) => void
  onMinimumChange: (value: string) => void
}

const numeric = (value: string) => value.trim() === '' ? NaN : Number(value)
const fieldStyles = {
  minWidth: 0,
  '& .MuiInputBase-root': { fontSize: 12, minHeight: 40 },
  '& .MuiInputLabel-root': { fontSize: 11 },
  '& .MuiFormHelperText-root': { mx: 0, fontSize: 10, lineHeight: 1.4 },
} as const

export default function KerbalismRateControls({ antennaSpeed, minimumBitsPerSecond, onSpeedChange, onMinimumChange }: KerbalismRateControlsProps) {
  const speed = numeric(antennaSpeed)
  const minimum = numeric(minimumBitsPerSecond)
  const validSpeed = Number.isFinite(speed) && speed >= 0 && speed <= MAX_KERBALISM_ANTENNA_SPEED
  const validMinimum = Number.isFinite(minimum) && minimum >= 0 && minimum <= MAX_KERBALISM_RATE_BITS_PER_SECOND
  return <Box component="details" sx={{ minWidth: 0, border: '1px solid', borderColor: 'divider', borderRadius: 1, px: 1, py: .75, bgcolor: '#080f2125' }}>
    <Box component="summary" sx={{ cursor: 'pointer', fontSize: 11, lineHeight: 1.5, color: validSpeed && validMinimum ? 'primary.light' : 'secondary.main', overflowWrap: 'anywhere' }}>
      Science rate settings · {validSpeed && validMinimum ? `${speed}× · min ${formatBitrate(minimum)}` : 'check inputs'}
    </Box>
    <Stack spacing={1} sx={{ pt: 1.25, minWidth: 0 }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1 }}>
        <TextField fullWidth size="small" type="number" label="Antenna speed" value={antennaSpeed} error={!validSpeed}
          onChange={event => onSpeedChange(event.target.value)} sx={fieldStyles}
          helperText={!validSpeed ? 'Enter 0–1,000.' : undefined}
          slotProps={{ htmlInput: { 'aria-label': 'Antenna speed', min: 0, max: MAX_KERBALISM_ANTENNA_SPEED, step: 'any' }, input: { endAdornment: <InputAdornment position="end"><Typography sx={{ fontSize: 10 }}>×</Typography></InputAdornment> } }} />
        <TextField fullWidth size="small" type="number" label="Minimum science rate" value={minimumBitsPerSecond} error={!validMinimum}
          onChange={event => onMinimumChange(event.target.value)} sx={fieldStyles}
          helperText={!validMinimum ? 'Enter 0–10¹⁸ bit/s.' : undefined}
          slotProps={{ htmlInput: { 'aria-label': 'Minimum science rate', min: 0, max: MAX_KERBALISM_RATE_BITS_PER_SECOND, step: 'any' }, input: { endAdornment: <InputAdornment position="end"><Typography sx={{ fontSize: 10 }}>bit/s</Typography></InputAdornment> } }} />
      </Box>
      <Typography sx={{ fontSize: 10, lineHeight: 1.45, color: 'text.secondary' }}>
        Antenna Speed starts at the Normal reference of 1.5×. Easy uses 2×, Moderate 1.2× and Hard 1×; match your save's Science settings.
      </Typography>
      <Typography sx={{ fontSize: 10, lineHeight: 1.45, color: 'text.secondary' }}>
        Kerbalism's minimum defaults to 1 bit/s and applies only to positive rates. Zero disables the floor; a blocked or out-of-range link still carries no science. Settings are shared by Network and Signals.
      </Typography>
    </Stack>
  </Box>
}
