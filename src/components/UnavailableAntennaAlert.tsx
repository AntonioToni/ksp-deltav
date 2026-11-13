import { Alert, Box, Button, Typography } from '@mui/material'

export interface UnavailableAntennaAlertProps {
  names: string[]
  onRestore: () => void
  restoreLabel: string
  onReplace?: () => void
  replaceLabel?: string
}

export default function UnavailableAntennaAlert({ names, onRestore, restoreLabel, onReplace, replaceLabel = 'Choose another antenna' }: UnavailableAntennaAlertProps) {
  const uniqueNames = [...new Set(names)]
  const models = uniqueNames.length ? uniqueNames.join(', ') : 'The selected antenna'
  return <Alert severity="warning" sx={{ py: .5, fontSize: 12, minWidth: 0, '& .MuiAlert-message': { minWidth: 0, width: '100%' }, '& .MuiAlert-icon': { mr: 1 } }}>
    <Typography sx={{ fontSize: 12, lineHeight: 1.45, overflowWrap: 'anywhere' }}>
      {models} {uniqueNames.length > 1 ? 'are' : 'is'} unavailable in this radio setup. Your antenna choices are kept. Choose a setup that includes them, or replace them to calculate this link.
    </Typography>
    <Box sx={{ mt: .75, display: 'flex', flexWrap: 'wrap', columnGap: .75, rowGap: .5 }}>
      <Button size="small" variant="outlined" onClick={onRestore} sx={{ minHeight: 32, px: 1, fontSize: 11, textTransform: 'none' }}>{restoreLabel}</Button>
      {onReplace && <Button size="small" onClick={onReplace} sx={{ minHeight: 32, px: 1, fontSize: 11, textTransform: 'none' }}>{replaceLabel}</Button>}
    </Box>
  </Alert>
}
