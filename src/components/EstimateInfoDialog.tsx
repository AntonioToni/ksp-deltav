import { useState } from 'react'
import {
  Box, Button, Dialog, DialogActions, DialogContent, DialogTitle,
  Link, Stack, Tab, Tabs, Typography,
} from '@mui/material'
import type { PlanetPack } from '../types/planner'
import type { DeltaVBudget } from '../utils/budget'
import type { BudgetBasisSummary } from '../utils/estimateBasis'
import { basisColors } from './estimatePresentation'

export type EstimateSection = 'mission' | 'sources'
const format = new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 })

interface Props {
  open: boolean
  initialSection: EstimateSection
  pack: PlanetPack
  customPack: boolean
  groups: readonly BudgetBasisSummary[]
  budget: DeltaVBudget | null
  notices: readonly string[]
  onClose: () => void
}

function Content({ initialSection, pack, customPack, groups, budget, notices }: Omit<Props, 'open' | 'onClose'>) {
  const [section, setSection] = useState(initialSection)
  const reserve = budget ? budget.baseDeltaV * budget.redundancyPercent / 100 : 0
  const rounding = budget ? Math.max(0, budget.extraDeltaV - reserve) : 0
  return <>
    <Tabs value={section} onChange={(_, value: EstimateSection) => setSection(value)} variant="fullWidth" aria-label="Estimate information" sx={{ px: 1.5, minHeight: 38, borderBottom: '1px solid', borderColor: 'divider', '& .MuiTab-root': { minWidth: 0, minHeight: 38, px: .5, py: .5, fontSize: 12, textTransform: 'none' } }}>
      <Tab id="estimate-mission-tab" aria-controls="estimate-mission-panel" label="This mission" value="mission" />
      <Tab id="estimate-sources-tab" aria-controls="estimate-sources-panel" label="Sources & assumptions" value="sources" />
    </Tabs>
    <DialogContent sx={{ px: 1.5, py: 1.5, minWidth: 0, minHeight: 0 }}>
      {section === 'mission' ? <Box role="tabpanel" id="estimate-mission-panel" aria-labelledby="estimate-mission-tab">
        {budget ? <>
          <Typography sx={{ fontSize: 12, lineHeight: 1.5, color: 'text.secondary', mb: 1.25 }}>Costs for the selected mission mode, before reserve. Each repeated maneuver is counted.</Typography>
          <Stack component="ul" aria-label="Budget basis" spacing={.75} sx={{ listStyle: 'none', m: 0, p: 0 }}>
            {groups.map(group => <Box component="li" key={group.kind} data-budget-summary-kind={group.kind} sx={{ px: 1.25, py: .75, display: 'flex', gap: 1, justifyContent: 'space-between', alignItems: 'center', border: '1px solid', borderColor: 'divider', borderRadius: 1, bgcolor: '#ffffff03' }}>
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontSize: 12, fontWeight: 500, color: basisColors[group.kind] }}>{group.label}</Typography>
                <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>{group.maneuvers} {group.maneuvers === 1 ? 'maneuver' : 'maneuvers'}</Typography>
              </Box>
              <Typography sx={{ fontSize: 13, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{format.format(group.deltaV)} m/s</Typography>
            </Box>)}
          </Stack>
          {!groups.length && <Typography sx={{ fontSize: 12 }}>No maneuvers required.</Typography>}
          <Box component="dl" sx={{ m: 0, mt: 1.25, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: .75, fontSize: 12, '& dt, & dd': { m: 0 }, '& dd': { textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' } }}>
            <Box component="dt">Maneuvers</Box><Box component="dd">{format.format(budget.baseDeltaV)} m/s</Box>
            <Box component="dt">Reserve (+{budget.redundancyPercent}%)</Box><Box component="dd" data-testid="estimate-reserve">{format.format(reserve)} m/s</Box>
            {rounding > 1e-8 && <><Box component="dt">Round up to whole m/s</Box><Box component="dd" data-testid="estimate-rounding">{format.format(rounding)} m/s</Box></>}
            <Box component="dt" sx={{ fontWeight: 700 }}>Planning total</Box><Box component="dd" sx={{ fontWeight: 700 }}>{format.format(budget.totalDeltaV)} m/s</Box>
          </Box>
          <Stack spacing={.75} sx={{ mt: 1.5 }}>
            {groups.some(group => group.kind === 'reference') && <Typography sx={{ fontSize: 12, lineHeight: 1.45, color: 'text.secondary' }}>Map figures use the source's reference conditions. Actual flight costs vary.</Typography>}
            {groups.some(group => group.kind === 'model') && <Typography sx={{ fontSize: 12, lineHeight: 1.45, color: 'text.secondary' }}>Analytic estimates use idealized reference orbits. Dates, vehicle losses, and a flown trajectory are not solved.</Typography>}
            {groups.some(group => group.kind === 'user') && <Typography sx={{ fontSize: 12, lineHeight: 1.45, color: basisColors.user }}>Your allowances are personal planning inputs, including explicit zero values. Source links describe their context and do not verify those costs.</Typography>}
            {groups.some(group => group.kind === 'placeholder') && <Typography sx={{ fontSize: 12, lineHeight: 1.45, color: basisColors.placeholder }}>Atmospheric landing uses an ascent-sized placeholder. It is not a verified landing cost or upper bound. Atmosphere options can replace it with your allowance.</Typography>}
            {groups.some(group => group.kind === 'ideal') && <Typography sx={{ fontSize: 12, lineHeight: 1.45, color: basisColors.ideal }}>Ideal capture assumes 0 m/s for eligible capture burns. Entry feasibility and cleanup burns are excluded; a percentage reserve adds nothing to a zero-cost burn.</Typography>}
            {groups.some(group => group.kind === 'imported') && <Typography sx={{ fontSize: 12, lineHeight: 1.45, color: 'text.secondary' }}>Imported or unclassified figures come from the pack author. Declared sources and model labels have not been independently verified by this planner.</Typography>}
            {notices.map(notice => <Typography key={notice} sx={{ fontSize: 12, lineHeight: 1.45, color: 'text.secondary' }}>{notice}</Typography>)}
          </Stack>
        </> : <Typography sx={{ fontSize: 13, lineHeight: 1.5 }}>Select a reachable mission to inspect its budget. The sources tab explains the active pack and its assumptions.</Typography>}
      </Box> : <Box role="tabpanel" id="estimate-sources-panel" aria-labelledby="estimate-sources-tab">
        <Typography sx={{ fontSize: 13, lineHeight: 1.5, mb: 1.25 }}>{pack.description}</Typography>
        {customPack && <Typography sx={{ fontSize: 12, lineHeight: 1.5, mb: 1.25, color: 'secondary.main' }}>Custom pack · Its figures and source declarations are supplied by the pack author.</Typography>}
        <Typography sx={{ fontSize: 12, lineHeight: 1.5, color: 'text.secondary', mb: 1.25 }}>A reference map supplies published planning figures; an analytic model computes schematic estimates. Neither validates a particular vehicle or dated trajectory. The This mission tab identifies the figures actually used in your budget.</Typography>
        <Stack spacing={1} sx={{ mb: 1.5 }}>{pack.sources.map(source => <Box key={source.id}>
          <Link href={source.url} target="_blank" rel="noreferrer" sx={{ fontSize: 12, lineHeight: 1.5, overflowWrap: 'anywhere' }}>{source.title}</Link>
          <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>{source.budgetType === 'reference' ? 'Reference map' : source.budgetType === 'model' ? 'Analytic model' : 'Configuration or supporting reference'}</Typography>
        </Box>)}</Stack>
        <Typography component="h3" sx={{ fontSize: 13, fontWeight: 600 }}>Pack assumptions</Typography>
        <Box component="ul" sx={{ pl: 2.25, my: .75, '& li': { fontSize: 12, lineHeight: 1.5, mb: .75, overflowWrap: 'anywhere' } }}>{pack.assumptions.map((assumption, index) => <li key={index}>{assumption}</li>)}</Box>
      </Box>}
    </DialogContent>
  </>
}

export default function EstimateInfoDialog(props: Props) {
  return <Dialog open={props.open} onClose={props.onClose} maxWidth="sm" fullWidth aria-labelledby="model-info-heading" sx={{ '& .MuiDialog-paper': { m: 1, width: 'calc(100% - 16px)', maxHeight: 'calc(100dvh - 16px)' } }}>
    <DialogTitle id="model-info-heading" sx={{ px: 1.5, py: 1, fontSize: 16 }}>About these estimates</DialogTitle>
    <Content key={`${props.pack.id}:${props.open}:${props.initialSection}`} {...props} />
    <DialogActions sx={{ px: 1.5, py: .75, flexShrink: 0 }}><Button variant="contained" onClick={props.onClose} sx={{ minHeight: 36, px: 2, fontSize: 12 }}>Close</Button></DialogActions>
  </Dialog>
}
