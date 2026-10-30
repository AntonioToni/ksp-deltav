import { Box } from '@mui/material'

// Fixed positions and pixel sizes keep the sky quiet and stable at every render.
const stars = [
  [3.6, 12.4, 1, .28], [8.2, 67.3, 1.5, .3], [14.7, 35.6, 1, .22],
  [19.3, 85.1, 1, .35], [23.8, 7.5, 1.5, .34], [29.6, 55.4, 1, .22],
  [34.1, 24.7, 1, .25], [39.8, 77.6, 1.5, .3], [45.2, 43.8, 1, .2],
  [49.3, 14.6, 2, .38], [54.7, 91.2, 1, .22], [59.4, 63.1, 1, .24],
  [64.8, 33.9, 1.5, .28], [70.5, 5.8, 1, .3], [74.2, 80.3, 1, .25],
  [79.6, 49.5, 1, .22], [84.3, 20.7, 1.5, .32], [89.1, 69.8, 2, .34],
  [94.5, 40.2, 1, .28], [97.2, 92.4, 1, .24],
  [2.1, 45.8, 1, .3], [5.4, 88.6, 1.5, .33], [10.6, 22.1, 1, .26],
  [12.3, 52.7, 1, .32], [16.8, 73.4, 1.5, .36], [21.5, 31.9, 1, .24],
  [25.7, 95.3, 1, .3], [27.2, 17.6, 1.5, .35], [31.9, 68.8, 1, .27],
  [35.6, 41.2, 2, .42], [37.3, 9.1, 1, .29], [41.7, 88.2, 1.5, .34],
  [44.1, 28.3, 1, .25], [47.6, 60.5, 1, .31], [51.8, 78.9, 1.5, .33],
  [55.3, 5.2, 1, .28], [57.9, 37.4, 1.5, .36], [61.6, 85.7, 1, .26],
  [65.9, 56.2, 1, .31], [68.3, 17.8, 2, .43], [72.7, 43.1, 1, .27],
  [76.1, 93.5, 1.5, .35], [78.4, 27.6, 1, .29], [82.6, 62.4, 1, .3],
  [86.8, 8.9, 1.5, .37], [88.2, 86.3, 1, .25], [91.7, 32.6, 1, .3],
  [93.4, 57.1, 2, .4], [96.1, 15.3, 1, .27], [98.4, 75.6, 1.5, .34],
  [6.8, 33.4, 1, .24], [11.9, 91.6, 1, .28], [18.1, 15.7, 1.5, .3],
  [24.2, 64.8, 1, .27], [32.7, 91.1, 1, .23], [42.6, 48.5, 1.5, .28],
  [50.5, 31.7, 1, .25], [60.8, 12.6, 1, .3], [67.1, 75.2, 1.5, .29],
  [73.9, 57.2, 1, .24], [81.2, 87.1, 1, .28], [87.6, 45.7, 1, .25],
  [92.5, 7.8, 1, .3], [95.8, 83.1, 1.5, .29],
] as const

// A few soft diffraction spikes give brighter stars a small, static + shape.
const crossStars = [
  [5.8, 57.2, 7, .36], [17.2, 43.5, 6, .32], [31.4, 13.7, 8, .36],
  [46.8, 83.6, 7, .32], [62.3, 46.2, 6, .34], [77.1, 12.8, 9, .38],
  [90.4, 77.6, 8, .34], [96.3, 29.5, 6, .32],
] as const

export default function SpaceBackground() {
  return (
    <Box
      aria-hidden="true"
      sx={{
        position: 'absolute', inset: 0, zIndex: 0, overflow: 'hidden',
        pointerEvents: 'none', userSelect: 'none', bgcolor: '#080f21',
        backgroundImage: 'radial-gradient(ellipse at 22% 12%, rgba(31,60,104,.32), transparent 65%), radial-gradient(ellipse at 85% 90%, rgba(18,40,79,.3), transparent 60%)',
      }}
    >
      {stars.map(([left, top, size, opacity]) => (
        <Box
          key={`${left}-${top}`}
          component="span"
          sx={{ position: 'absolute', borderRadius: '50%', bgcolor: '#d6e6ff' }}
          style={{ left: `${left}%`, top: `${top}%`, width: size, height: size, opacity, boxShadow: size === 2 ? '0 0 5px rgba(163,199,255,.25)' : undefined }}
        />
      ))}
      {crossStars.map(([left, top, size, opacity]) => (
        <Box
          key={`cross-${left}-${top}`}
          component="span"
          sx={{
            position: 'absolute',
            filter: 'drop-shadow(0 0 2px rgba(163,199,255,.3))',
            '&::before, &::after': { content: '""', position: 'absolute' },
            '&::before': {
              left: 0, top: '50%', width: '100%', height: '1px', transform: 'translateY(-50%)',
              backgroundImage: 'linear-gradient(90deg, transparent, #d6e6ff 50%, transparent)',
            },
            '&::after': {
              left: '50%', top: 0, width: '1px', height: '100%', transform: 'translateX(-50%)',
              backgroundImage: 'linear-gradient(transparent, #d6e6ff 50%, transparent)',
            },
          }}
          style={{ left: `${left}%`, top: `${top}%`, width: size, height: size, opacity }}
        />
      ))}
    </Box>
  )
}
