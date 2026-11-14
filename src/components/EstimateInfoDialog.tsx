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
  defaultReentry: boolean
  idealCapture: boolean
  onClose: () => void
}

function Content({ initialSection, pack, customPack, groups, budget, notices, defaultReentry, idealCapture }: Omit<Props, 'open' | 'onClose'>) {
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
          <Typography sx={{ fontSize: 12, lineHeight: 1.5, color: 'text.secondary', mb: 1.25 }}>Delta-V for your selected trip, before the reserve. A maneuver counts each time the route uses it.</Typography>
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
            {groups.some(group => group.kind === 'reference') && <Typography sx={{ fontSize: 12, lineHeight: 1.45, color: 'text.secondary' }}>Published map figures assume the orbits and conditions listed by their authors. Your flight may need different Delta-V.</Typography>}
            {groups.some(group => group.kind === 'model') && <Typography sx={{ fontSize: 12, lineHeight: 1.45, color: 'text.secondary' }}>Calculated estimates use simplified orbits. They do not predict an exact flight date or account for losses from your vehicle and how you fly it.</Typography>}
            {groups.some(group => group.kind === 'user') && <Typography sx={{ fontSize: 12, lineHeight: 1.45, color: basisColors.user }}>These are Delta-V amounts you entered, including any zeros. Source links explain the route but do not verify your numbers.</Typography>}
            {groups.some(group => group.kind === 'placeholder') && <Typography sx={{ fontSize: 12, lineHeight: 1.45, color: basisColors.placeholder }}>Until you enter a landing allowance, this pack reuses the launch Delta-V as a default for atmospheric landings. It is not a verified landing cost or guaranteed maximum. Open Atmosphere to set your powered-landing Delta-V.</Typography>}
            {defaultReentry && <Typography sx={{ fontSize: 12, lineHeight: 1.45, color: basisColors.ideal }}>Kerbin landing defaults to 0 m/s of engine burns, assuming atmospheric braking and parachutes. Safe entry, deorbit and correction burns are not calculated. Ascent and orbital capture keep their own costs. Open Atmosphere to enter a landing budget or turn this assumption off.</Typography>}
            {idealCapture && <Typography sx={{ fontSize: 12, lineHeight: 1.45, color: basisColors.ideal }}>Selected capture burns count as 0 m/s, assuming the atmosphere removes all the required speed. Entry safety and correction burns are not calculated; adding a percentage reserve to zero still gives zero.</Typography>}
            {groups.some(group => group.kind === 'imported') && <Typography sx={{ fontSize: 12, lineHeight: 1.45, color: 'text.secondary' }}>These figures come from the pack author, including any costs without a map or calculation source. This planner has not independently checked their declared sources or calculation method.</Typography>}
            {notices.map(notice => <Typography key={notice} sx={{ fontSize: 12, lineHeight: 1.45, color: 'text.secondary' }}>{notice}</Typography>)}
          </Stack>
        </> : <Typography sx={{ fontSize: 13, lineHeight: 1.5 }}>Choose an origin and destination with a route between them to inspect the budget. Sources & assumptions explains the active pack.</Typography>}
      </Box> : <Box role="tabpanel" id="estimate-sources-panel" aria-labelledby="estimate-sources-tab">
        <Typography sx={{ fontSize: 13, lineHeight: 1.5, mb: 1.25 }}>{pack.description}</Typography>
        {customPack && <Typography sx={{ fontSize: 12, lineHeight: 1.5, mb: 1.25, color: 'secondary.main' }}>Custom pack · The pack author supplies its Delta-V figures and source information.</Typography>}
        <Typography sx={{ fontSize: 12, lineHeight: 1.5, color: 'text.secondary', mb: 1.25 }}>Map figures come from published Delta-V maps. Calculated estimates use simplified orbits. Both are planning guides, rather than predictions for a particular craft or launch date. This mission shows which figures your budget uses.</Typography>
        <Stack spacing={1} sx={{ mb: 1.5 }}>{pack.sources.map(source => <Box key={source.id}>
          <Link href={source.url} target="_blank" rel="noreferrer" sx={{ fontSize: 12, lineHeight: 1.5, overflowWrap: 'anywhere' }}>{source.title}</Link>
          <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>{source.budgetType === 'reference' ? 'Published Delta-V map' : source.budgetType === 'model' ? 'Calculated estimate' : 'Settings or supporting source'}</Typography>
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
