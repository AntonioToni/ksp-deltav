import { Alert, Box, Button, Typography } from '@mui/material'

interface RelayBodyReferenceProps {
  bodyName: string
  values: { radius: string; atmosphere: string; mu: string; soi: string }
  reference: boolean
  onEdit: () => void
}

type Field = keyof RelayBodyReferenceProps['values']

const number = new Intl.NumberFormat('en-US', { maximumSignificantDigits: 6 })
const scientific = new Intl.NumberFormat('en-US', { notation: 'scientific', maximumSignificantDigits: 6 })
const superscript: Record<string, string> = {
  '-': '⁻', '+': '⁺', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
  '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
}
const fields: { key: Field; label: string; unit: string }[] = [
  { key: 'radius', label: 'Body radius', unit: 'km' },
  { key: 'atmosphere', label: 'Atmosphere height', unit: 'km' },
  { key: 'mu', label: 'Gravitational parameter', unit: 'm³/s²' },
  { key: 'soi', label: 'Sphere of influence', unit: 'km' },
]

function valid(raw: string, key: Field): boolean {
  const value = Number(raw)
  return raw.trim() !== '' && Number.isFinite(value) && (key === 'atmosphere' ? value >= 0 : value > 0)
}

/** Display formatting only: calculations continue using the parent's raw strings. */
function display(raw: string, key: Field): string {
  if (!raw.trim()) return 'Not supplied'
  if (!valid(raw, key)) return 'Invalid value'
  const value = Number(raw)
  return key === 'mu' || value >= 1e9 || value > 0 && value < .001
    ? scientific.format(value).replace(/E([+-]?\d+)/, (_, exponent: string) => ` × 10${[...exponent].map(character => superscript[character]).join('')}`)
    : number.format(value)
}

export default function RelayBodyReference({ bodyName, values, reference, onEdit }: RelayBodyReferenceProps) {
  const requiredIssues = fields.filter(field => field.key !== 'soi' && !valid(values[field.key], field.key))
  const invalidSoi = values.soi.trim() !== '' && !valid(values.soi, 'soi')
  const missingSoi = values.soi.trim() === ''

  return <Box component="section" aria-label={`${bodyName} body data`} data-testid="relay-body-reference" sx={{ minWidth: 0 }}>
    <Typography component="h3" sx={{ m: 0, mb: 1, fontSize: 14, fontWeight: 500, lineHeight: 1.4 }}>
      {reference ? 'Reference body data' : 'Custom body data'}
    </Typography>
    {requiredIssues.length > 0 && <Alert severity="warning" sx={{ mb: 1.25, py: .5, minWidth: 0, fontSize: 12, lineHeight: 1.45, '& .MuiAlert-message': { minWidth: 0, overflowWrap: 'anywhere' } }}>
      {bodyName} needs valid {requiredIssues.map(field => field.label.toLowerCase()).join(', ')} before relay orbits can be calculated. Enter or correct these values in Advanced mode.
    </Alert>}
    {invalidSoi && <Alert severity="warning" sx={{ mb: 1.25, py: .5, fontSize: 12, lineHeight: 1.45 }}>
      The sphere of influence is invalid. Correct it in Advanced mode to check the outer orbit limit.
    </Alert>}
    <Box component="dl" sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: .75, m: 0, minWidth: 0 }}>
      {fields.map(field => {
        const raw = values[field.key]
        const hasValue = valid(raw, field.key)
        return <Box key={field.key} sx={{ px: 1, py: .75, minWidth: 0, border: '1px solid', borderColor: 'divider', borderRadius: 1, bgcolor: '#080f2145' }}>
          <Typography component="dt" sx={{ fontSize: 11.5, lineHeight: 1.35, color: 'text.secondary' }}>{field.label}</Typography>
          <Typography component="dd" sx={{ m: 0, mt: .375, minWidth: 0 }}>
            <Box component="output" aria-label={field.label} data-testid={`relay-body-reference-${field.key}`}
              title={hasValue ? `Full value: ${raw} ${field.unit}` : undefined}
              sx={{ display: 'block', fontSize: 14, fontWeight: 500, lineHeight: 1.4, fontVariantNumeric: 'tabular-nums', overflowWrap: 'anywhere', color: !hasValue && raw.trim() ? 'secondary.main' : 'text.primary' }}>
              {display(raw, field.key)}{hasValue ? ` ${field.unit}` : ''}
            </Box>
          </Typography>
        </Box>
      })}
    </Box>
    {missingSoi && <Typography sx={{ mt: 1, fontSize: 12, lineHeight: 1.45, color: 'text.secondary' }}>
      The sphere of influence is not supplied, so the outer orbit limit cannot be checked.
    </Typography>}
    <Typography sx={{ mt: 1, fontSize: 12, lineHeight: 1.45, color: 'text.secondary' }}>
      Values are formatted for readability. Advanced mode keeps the full entered precision.
    </Typography>
    <Button size="small" onClick={onEdit} sx={{ mt: .5, minHeight: 36, px: .5, fontSize: 12, textTransform: 'none' }}>
      Edit in Advanced mode
    </Button>
  </Box>
}
