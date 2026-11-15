import { Box, Button, Typography } from '@mui/material'

interface AdvancedSettingsNoticeProps {
  onOpen: () => void
  message?: string
  actionLabel?: string
}

export default function AdvancedSettingsNotice({
  onOpen,
  message = 'Custom advanced settings are active.',
  actionLabel = 'View settings',
}: AdvancedSettingsNoticeProps) {
  return <Box role="note" sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: .75, rowGap: .25, minWidth: 0 }}>
    <Typography sx={{ fontSize: 12, lineHeight: 1.45, color: 'text.secondary', minWidth: 0, overflowWrap: 'anywhere' }}>{message}</Typography>
    <Button size="small" onClick={onOpen} sx={{ minHeight: 32, minWidth: 0, px: .5, py: .25, fontSize: 12, lineHeight: 1.35, textTransform: 'none' }}>{actionLabel}</Button>
  </Box>
}
