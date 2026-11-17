import { useState } from 'react'
import { InputAdornment, TextField, Typography } from '@mui/material'
import { MAX_KERBALISM_RATE_BITS_PER_SECOND } from '../utils/kerbalismBitrate'
import { scienceRateBitsToBytesInput, scienceRateBytesToBitsInput } from './scienceRateInput'

interface ScienceRateFieldProps {
  label: string
  valueBitsPerSecond: string
  onChangeBitsPerSecond: (value: string) => void
  helperText?: string
  optional?: boolean
}

const maxBytesPerSecond = MAX_KERBALISM_RATE_BITS_PER_SECOND / 8
const fieldStyles = {
  minWidth: 0,
  '& .MuiInputBase-root': { fontSize: 13, minHeight: 40 },
  '& .MuiInputLabel-root': { fontSize: 16 },
  '& .MuiOutlinedInput-notchedOutline > legend': { fontSize: 12 },
  '& .MuiFormHelperText-root': { mx: 0, fontSize: 12, lineHeight: 1.4 },
} as const

/** Edits bytes at the presentation boundary without changing bit-based drafts. */
export default function ScienceRateField({ label, valueBitsPerSecond, onChangeBitsPerSecond, helperText, optional = true }: ScienceRateFieldProps) {
  const [draft, setDraft] = useState(() => ({
    bits: valueBitsPerSecond,
    bytes: scienceRateBitsToBytesInput(valueBitsPerSecond),
  }))

  // Match changes from another endpoint or a restored draft. An echoed change
  // already matches draft.bits, preserving the user's decimal text and caret.
  if (draft.bits !== valueBitsPerSecond) {
    setDraft({ bits: valueBitsPerSecond, bytes: scienceRateBitsToBytesInput(valueBitsPerSecond) })
  }

  const blank = draft.bytes.trim() === ''
  const bytes = Number(draft.bytes)
  const invalid = blank ? !optional : !Number.isFinite(bytes) || bytes < 0 || bytes > maxBytesPerSecond

  return <TextField fullWidth size="small" type="number" label={label} value={draft.bytes} error={invalid}
    placeholder={optional ? 'Not supplied' : undefined}
    onChange={event => {
      const bytes = event.target.value
      const bits = scienceRateBytesToBitsInput(bytes)
      setDraft({ bits, bytes })
      onChangeBitsPerSecond(bits)
    }}
    helperText={invalid ? 'Enter 0–1.25 × 10¹⁷ B/s.' : helperText}
    slotProps={{
      htmlInput: { 'aria-label': label, min: 0, max: maxBytesPerSecond, step: 'any' },
      input: { endAdornment: <InputAdornment position="end"><Typography sx={{ fontSize: 13 }}>B/s</Typography></InputAdornment> },
    }} sx={fieldStyles} />
}
