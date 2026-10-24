import React from 'react';
import ReactDOM from 'react-dom/client';
import { CssBaseline, ThemeProvider, createTheme } from '@mui/material';
import '@fontsource/roboto/latin-400.css';
import '@fontsource/roboto/latin-500.css';
import '@fontsource/roboto/latin-700.css';
import App from './App';

const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: '#73c8fa', dark: '#3f91c3' },
    secondary: { main: '#e7bd7b' },
    background: { default: '#080f21', paper: '#111d32' },
    text: { primary: '#e9ecf4', secondary: '#a3b0c4' },
    divider: '#2a3b54',
  },
  typography: { fontFamily: 'Roboto, sans-serif', button: { textTransform: 'none' } },
  shape: { borderRadius: 12 },
  components: {
    MuiCssBaseline: { styleOverrides: { 'html, body, #root': { width: '100%', height: '100%', margin: 0, overflow: 'hidden' } } },
    MuiPaper: { defaultProps: { elevation: 0 }, styleOverrides: { root: { backgroundImage: 'linear-gradient(145deg, rgba(255,255,255,.025), transparent 65%)', border: '1px solid #2a3b54' } } },
    MuiButton: { styleOverrides: { root: { minHeight: 44, '&.Mui-focusVisible': { outline: '2px solid #b3e3ff', outlineOffset: 2 } } } },
    MuiIconButton: { styleOverrides: { root: { color: '#a3b0c4', '&:hover': { color: '#e9ecf4', backgroundColor: 'rgba(255,255,255,.06)' } } } },
    MuiSlider: { styleOverrides: {
      rail: { opacity: 1, backgroundColor: '#31445e' },
      track: { border: 0, backgroundImage: 'linear-gradient(90deg, #3f91c3, #73c8fa)' },
      thumb: { boxShadow: '0 0 0 3px rgba(115,200,250,.1)', '&:hover, &.Mui-focusVisible': { boxShadow: '0 0 0 5px rgba(115,200,250,.16)' } },
      valueLabel: { backgroundColor: '#2b415b', borderRadius: 4, fontSize: 11 },
    } },
    MuiAccordion: { styleOverrides: { root: { '&:before': { display: 'none' } } } },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <App />
    </ThemeProvider>
  </React.StrictMode>
);
