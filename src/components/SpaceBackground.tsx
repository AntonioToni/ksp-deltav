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
    </Box>
  )
}
