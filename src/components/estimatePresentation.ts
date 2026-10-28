import type { BudgetBasisKind } from '../utils/estimateBasis'

export const basisColors: Record<BudgetBasisKind, string> = {
  reference: '#b4c8df', model: '#c1b8ee', user: '#e7bd7b',
  ideal: '#92d5c6', placeholder: '#eead91', imported: '#bac0cc',
}

export const basisShortNames: Record<BudgetBasisKind, string> = {
  reference: 'Map', model: 'Model', user: 'Yours', ideal: 'Ideal', placeholder: 'Placeholder', imported: 'Imported',
}
