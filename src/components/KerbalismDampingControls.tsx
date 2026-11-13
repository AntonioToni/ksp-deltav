import { Box, MenuItem, Stack, TextField, Typography } from '@mui/material'

export type KerbalismDampingMode = 'automatic' | 'custom'

export interface KerbalismDampingControlsProps {
  mode: KerbalismDampingMode
  customExponent: string
  onModeChange: (mode: KerbalismDampingMode) => void
  onExponentChange: (value: string) => void
  calibration: {
    exponent: number
    source: 'automatic' | 'fallback'
    calibrationDistanceM: number | null
    calibrationStrength: number | null
  }
  homeOrbitRadiusM: number | null
  maximumDsnPowerM: number
}

const number = new Intl.NumberFormat('en-US', { maximumSignificantDigits: 6 })
const fieldStyles = {
  minWidth: 0,
  '& .MuiInputBase-root': { fontSize: 12, minHeight: 38 },
  '& .MuiInputLabel-root': { fontSize: 11 },
  '& .MuiSelect-select': { py: 1, pr: '28px !important' },
  '& .MuiFormHelperText-root': { mx: 0, fontSize: 10, lineHeight: 1.35 },
} as const

function distance(value: number): string {
  const [scale, unit] = value >= 1e12 ? [1e12, 'Tm'] : value >= 1e9 ? [1e9, 'Gm']
    : value >= 1e6 ? [1e6, 'Mm'] : value >= 1000 ? [1000, 'km'] : [1, 'm']
  return `${number.format(value / scale)} ${unit}`
}

export default function KerbalismDampingControls({ mode, customExponent, onModeChange, onExponentChange, calibration, homeOrbitRadiusM, maximumDsnPowerM }: KerbalismDampingControlsProps) {
  const custom = customExponent.trim() === '' ? NaN : Number(customExponent)
  const customValid = Number.isFinite(custom) && custom > 0 && custom <= 1e6
  const exponent = mode === 'automatic' ? calibration.exponent : customValid ? custom : NaN
  return <Box component="details" sx={{ minWidth: 0, border: '1px solid', borderColor: 'divider', borderRadius: 1, px: 1, py: .75, bgcolor: '#080f2125' }}>
    <Box component="summary" sx={{ cursor: 'pointer', fontSize: 11, lineHeight: 1.5, color: 'primary.light', overflowWrap: 'anywhere' }}>
      Kerbalism damping · k = {Number.isFinite(exponent) ? number.format(exponent) : '—'}{mode === 'automatic' && calibration.source === 'fallback' ? ' · fallback' : ''}
    </Box>
    <Stack spacing={1} sx={{ pt: 1.25, minWidth: 0 }}>
      <Typography sx={{ fontSize: 10, lineHeight: 1.45, color: 'text.secondary' }}>
        Damping adjusts how CommNet signal strength affects science transmission. Automatic follows Kerbalism 3.44; Custom lets you match your installation.
      </Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: mode === 'custom' ? 'repeat(2, minmax(0, 1fr))' : 'minmax(0, 1fr)', gap: 1 }}>
        <TextField select fullWidth size="small" label="Damping mode" value={mode} onChange={event => onModeChange(event.target.value as KerbalismDampingMode)} sx={fieldStyles}>
          <MenuItem value="automatic" sx={{ fontSize: 12 }}>Automatic (3.44)</MenuItem>
          <MenuItem value="custom" sx={{ fontSize: 12 }}>Custom exponent</MenuItem>
        </TextField>
        {mode === 'custom' && <TextField fullWidth size="small" type="number" label="Damping exponent" value={customExponent}
          error={!customValid} onChange={event => onExponentChange(event.target.value)} sx={fieldStyles}
          helperText={!customValid ? 'Enter an exponent greater than 0, up to 1,000,000.' : undefined}
          slotProps={{ htmlInput: { 'aria-label': 'Damping exponent', min: Number.MIN_VALUE, max: 1e6, step: 'any' } }} />}
      </Box>
      {mode === 'automatic' && <Typography sx={{ fontSize: 10, lineHeight: 1.45, color: calibration.source === 'fallback' ? 'secondary.main' : 'text.secondary' }}>
        {calibration.source === 'fallback'
          ? homeOrbitRadiusM === null
            ? 'The homeworld’s orbit is unknown. Using Kerbalism’s fallback k = 6; choose Custom exponent to match your save.'
            : 'Automatic calculation found no suitable reference distance. Using Kerbalism’s fallback k = 6; choose Custom exponent to match your save.'
          : `Calculated from the homeworld’s orbit radius (${distance(homeOrbitRadiusM!)}) and strongest ground-station preset (${distance(maximumDsnPowerM)}).`}
      </Typography>}
      <Typography sx={{ fontSize: 10, lineHeight: 1.45, color: 'text.secondary' }}>
        Automatic uses the homeworld and strongest DSN preset, so changing this link's antennas or DSN level does not change the exponent. For a custom installation, enter DampingExponentOverride from Kerbalism's settings or DataRateDampingExponent from KSP.log as the Custom exponent.
      </Typography>
      <Typography sx={{ fontSize: 10, lineHeight: 1.45, color: 'text.secondary' }}>
        S is raw CommNet strength from 0 to 1; k is the exponent above. Kerbalism signal is S^k. The science-rate cards convert this factor into bit/s; antenna range and body blocking still use raw CommNet rules.
      </Typography>
    </Stack>
  </Box>
}
