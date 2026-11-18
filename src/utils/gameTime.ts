export type CalendarKind = 'kerbin' | 'earth'

export interface GameDate { year: number; day: number; hour: number; minute: number; second: number }
export type GameDateResult = { status: 'success'; utS: number } | { status: 'invalid'; errors: string[] }

export const KERBIN_DAY_SECONDS = 21_600
export const KERBIN_YEAR_DAYS = 426
export const EARTH_DAY_SECONDS = 86_400
/** RSS's official RealDateTimeFormatter epoch; no leap-second adjustment. */
export const EARTH_EPOCH_YEAR = 1951
const earthEpochMs = Date.UTC(EARTH_EPOCH_YEAR, 0, 1)
const leapYear = (year: number) => year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)

export function gameDateToUT(date: GameDate, calendar: CalendarKind): GameDateResult {
  const { year, day, hour, minute, second } = date
  const hours = calendar === 'kerbin' ? 6 : 24
  const days = calendar === 'kerbin' ? KERBIN_YEAR_DAYS : leapYear(year) ? 366 : 365
  if (!Number.isInteger(year) || year < 1 || year > 9999
    || !Number.isInteger(day) || day < 1 || day > days
    || !Number.isInteger(hour) || hour < 0 || hour >= hours
    || !Number.isInteger(minute) || minute < 0 || minute >= 60
    || !Number.isFinite(second) || second < 0 || second >= 60) {
    return { status: 'invalid', errors: [`Enter a valid year, day (1–${days}), and time (00:00:00–${hours - 1}:59:59).`] }
  }
  const secondsOfDay = hour * 3600 + minute * 60 + second
  if (calendar === 'kerbin') return { status: 'success', utS: ((year - 1) * KERBIN_YEAR_DAYS + day - 1) * KERBIN_DAY_SECONDS + secondsOfDay }
  const start = new Date(0)
  start.setUTCFullYear(year, 0, 1)
  start.setUTCHours(0, 0, 0, 0)
  return { status: 'success', utS: (start.getTime() - earthEpochMs) / 1000 + (day - 1) * EARTH_DAY_SECONDS + secondsOfDay }
}

/** null keeps invalid/partial UT input out of date controls instead of throwing. */
export function utToGameDate(utS: number, calendar: CalendarKind): GameDate | null {
  if (!Number.isFinite(utS)) return null
  if (calendar === 'kerbin') {
    if (utS < 0) return null
    const dayCount = Math.floor(utS / KERBIN_DAY_SECONDS)
    const year = Math.floor(dayCount / KERBIN_YEAR_DAYS) + 1
    if (year > 9999) return null
    const secondsOfDay = utS - dayCount * KERBIN_DAY_SECONDS
    const hour = Math.floor(secondsOfDay / 3600)
    const minute = Math.floor((secondsOfDay - hour * 3600) / 60)
    return { year, day: dayCount % KERBIN_YEAR_DAYS + 1, hour, minute, second: secondsOfDay - hour * 3600 - minute * 60 }
  }
  const absoluteS = earthEpochMs / 1000 + utS
  const wholeDay = Math.floor(absoluteS / EARTH_DAY_SECONDS)
  const date = new Date(wholeDay * EARTH_DAY_SECONDS * 1000)
  const year = date.getUTCFullYear()
  if (!Number.isFinite(year) || year < 1 || year > 9999) return null
  const start = new Date(0)
  start.setUTCFullYear(year, 0, 1)
  start.setUTCHours(0, 0, 0, 0)
  const day = Math.round((date.getTime() - start.getTime()) / (EARTH_DAY_SECONDS * 1000)) + 1
  const secondsOfDay = absoluteS - wholeDay * EARTH_DAY_SECONDS
  const hour = Math.floor(secondsOfDay / 3600)
  const minute = Math.floor((secondsOfDay - hour * 3600) / 60)
  return { year, day, hour, minute, second: secondsOfDay - hour * 3600 - minute * 60 }
}
