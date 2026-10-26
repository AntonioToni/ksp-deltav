import { useEffect, useRef, useState } from 'react'
import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle,
  IconButton, Link, Stack, Typography,
} from '@mui/material'
import UploadFileRounded from '@mui/icons-material/UploadFileRounded'
import DownloadRounded from '@mui/icons-material/DownloadRounded'
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded'
import CheckRounded from '@mui/icons-material/CheckRounded'
import type { PlanetPack } from '../types/planner'
import { MAX_CUSTOM_PACKS, MAX_PACK_BYTES, parsePlanetPackJson } from '../utils/customPacks'

interface PlanetPacksDialogProps {
  open: boolean
  currentPack: PlanetPack
  customPacks: readonly PlanetPack[]
  storageWarning: string | null
  onImport: (pack: PlanetPack) => string | null
  onSelect: (id: string) => void
  onRemove: (id: string) => void
  onClose: () => void
}

function PackContent({ currentPack, customPacks, storageWarning, onImport, onSelect, onRemove }: Omit<PlanetPacksDialogProps, 'open' | 'onClose'>) {
  const fileInput = useRef<HTMLInputElement>(null)
  const mounted = useRef(false)
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [notice, setNotice] = useState<string | null>(null)
  const atLimit = customPacks.length >= MAX_CUSTOM_PACKS

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  async function importFile(file: File | undefined) {
    if (!file || busy) return
    setErrors([])
    setNotice(null)
    if (file.size > MAX_PACK_BYTES) {
      setErrors(['Choose a JSON file no larger than 1 MiB.'])
      return
    }
    setBusy(true)
    try {
      const text = await file.text()
      if (!mounted.current) return
      const result = parsePlanetPackJson(text)
      if (result.status === 'error') {
        setErrors(result.errors)
      } else {
        const error = onImport(result.pack)
        if (error) setErrors([error])
        else setNotice(`${result.pack.name} imported. Choose Use to open its map.`)
      }
    } catch {
      if (mounted.current) setErrors(['The file could not be read. Choose a local JSON file and try again.'])
    } finally {
      if (mounted.current) setBusy(false)
    }
  }

  function exportCurrentPack() {
    setErrors([])
    setNotice(null)
    try {
      const blob = new Blob([`${JSON.stringify(currentPack, null, 2)}\n`], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${currentPack.id.replace(/[^a-z0-9._-]/gi, '_')}.json`
      document.body.append(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch {
      setErrors(['The pack could not be exported. Please try again.'])
    }
  }

  return <DialogContent sx={{ px: 1.5, pt: .5, pb: 1, minWidth: 0, overflowY: 'auto' }}>
    <Typography id="planet-packs-description" sx={{ mb: 1, fontSize: 12, lineHeight: 1.4, color: 'text.secondary' }}>
      Import your own maneuver data. Files stay in this browser; imported estimates are provided by their author.
    </Typography>
    <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: .75 }}>
      <Button variant="contained" size="small" startIcon={<UploadFileRounded sx={{ fontSize: '17px !important' }} />} disabled={busy || atLimit} onClick={() => fileInput.current?.click()} sx={{ px: .75, minHeight: 36, fontSize: 12, whiteSpace: 'nowrap' }}>
        {busy ? 'Reading…' : 'Import JSON'}
      </Button>
      <Button variant="outlined" size="small" startIcon={<DownloadRounded sx={{ fontSize: '17px !important' }} />} disabled={busy} onClick={exportCurrentPack} sx={{ px: .75, minHeight: 36, fontSize: 11, whiteSpace: 'nowrap' }}>Export current pack</Button>
      <input ref={fileInput} type="file" aria-label="Import planet pack" accept=".json,application/json" disabled={busy || atLimit} hidden onChange={event => {
        const file = event.currentTarget.files?.[0]
        event.currentTarget.value = ''
        void importFile(file)
      }} />
    </Box>
    <Typography title={currentPack.name} sx={{ mt: .5, mb: 1.5, fontSize: 11, color: 'text.secondary', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Current pack: {currentPack.name}</Typography>
    <Stack spacing={.75} sx={{ mb: errors.length || notice || storageWarning ? 1 : 0 }}>
      {storageWarning && <Alert severity="warning" sx={{ py: .25, fontSize: 12, overflowWrap: 'anywhere', '& .MuiAlert-message': { minWidth: 0 } }}>{storageWarning}</Alert>}
      {errors.length > 0 && <Alert severity="error" sx={{ py: .25, fontSize: 12, overflowWrap: 'anywhere', '& .MuiAlert-message': { minWidth: 0 } }}>
        <Box component="ul" sx={{ m: 0, pl: 2, '& li + li': { mt: .25 } }}>
          {errors.slice(0, 5).map((error, index) => <li key={index}>{error}</li>)}
          {errors.length > 5 && <li>{errors.length - 5} more issues. Check the pack format guide below.</li>}
        </Box>
      </Alert>}
      {notice && <Alert severity="success" role="status" sx={{ py: .25, fontSize: 12, overflowWrap: 'anywhere', '& .MuiAlert-message': { minWidth: 0 } }}>{notice}</Alert>}
    </Stack>
    <Typography component="h3" sx={{ mb: .75, fontSize: 12, fontWeight: 500, color: 'text.secondary' }}>Your packs <Box component="span" sx={{ ml: .5, fontVariantNumeric: 'tabular-nums' }}>{customPacks.length}/{MAX_CUSTOM_PACKS}</Box></Typography>
    {customPacks.length === 0 && <Typography sx={{ px: 1.25, py: 1.5, fontSize: 12, lineHeight: 1.4, border: '1px dashed', borderColor: 'divider', borderRadius: 1, color: 'text.secondary' }}>
      No custom packs yet. Export an existing pack as a starting point, then give it a new ID before importing.
    </Typography>}
    <Box component="ul" aria-label="Custom planet packs" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: .75 }}>
      {customPacks.map(pack => <Box component="li" key={pack.id} sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', alignItems: 'center', columnGap: .5, px: 1, py: .75, border: '1px solid', borderColor: pack.id === currentPack.id ? '#73c8fa80' : 'divider', bgcolor: pack.id === currentPack.id ? '#73c8fa0a' : '#ffffff03', borderRadius: 1 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontSize: 12, fontWeight: 500, lineHeight: 1.35, overflowWrap: 'anywhere' }}>{pack.name}</Typography>
          <Typography sx={{ mt: .25, fontSize: 10, lineHeight: 1.35, color: 'text.secondary', overflowWrap: 'anywhere' }}>v{pack.version} · {pack.bodies.length} bodies · {pack.nodes.length} states</Typography>
        </Box>
        <Stack direction="row" sx={{ alignItems: 'center' }}>
          <Button size="small" aria-label={`Use ${pack.name}`} disabled={busy} onClick={() => onSelect(pack.id)} startIcon={pack.id === currentPack.id ? <CheckRounded sx={{ fontSize: '14px !important' }} /> : undefined} sx={{ minWidth: 42, minHeight: 32, px: .75, fontSize: 11 }}>{pack.id === currentPack.id ? 'Active' : 'Use'}</Button>
          <IconButton size="small" aria-label={`Remove ${pack.name}`} disabled={busy} onClick={() => {
            onRemove(pack.id)
            setNotice(null)
            setErrors([])
          }} sx={{ width: 32, height: 32 }}><DeleteOutlineRounded sx={{ fontSize: 18 }} /></IconButton>
        </Stack>
      </Box>)}
    </Box>
    {atLimit && <Typography role="status" sx={{ mt: .75, fontSize: 11, color: 'text.secondary' }}>All {MAX_CUSTOM_PACKS} pack slots are in use. Remove a pack to import another.</Typography>}
  </DialogContent>
}

export default function PlanetPacksDialog({ open, currentPack, customPacks, storageWarning, onImport, onSelect, onRemove, onClose }: PlanetPacksDialogProps) {
  return <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" aria-labelledby="planet-packs-heading" aria-describedby="planet-packs-description" sx={{ '& .MuiDialog-paper': { m: 1, width: 'calc(100% - 16px)', maxHeight: 'calc(100dvh - 16px)' } }}>
    <DialogTitle id="planet-packs-heading" sx={{ px: 1.5, py: 1, fontSize: 16, lineHeight: 1.5 }}>Planet packs</DialogTitle>
    <PackContent key={String(open)} currentPack={currentPack} customPacks={customPacks} storageWarning={storageWarning} onImport={onImport} onSelect={onSelect} onRemove={onRemove} />
    <DialogActions sx={{ px: 1.5, py: .75, justifyContent: 'space-between' }}>
      <Link href="https://github.com/AntonioToni/ksp-deltav/blob/main/docs/CUSTOM_PACKS.md" target="_blank" rel="noreferrer" sx={{ fontSize: 12 }}>Pack format guide</Link>
      <Button size="small" variant="contained" onClick={onClose} sx={{ minHeight: 36, px: 2, fontSize: 12 }}>Done</Button>
    </DialogActions>
  </Dialog>
}
