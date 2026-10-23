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
    background: { default: '#191a24', paper: '#20212d' },
    text: { primary: '#e5e6ee', secondary: '#9d9eaf' },
    divider: '#333541',
  },
  typography: { fontFamily: 'Roboto, sans-serif', button: { textTransform: 'none' } },
  shape: { borderRadius: 12 },
  components: {
    MuiCssBaseline: { styleOverrides: { 'html, body, #root': { width: '100%', height: '100%', margin: 0, overflow: 'hidden' } } },
    MuiPaper: { defaultProps: { elevation: 0 }, styleOverrides: { root: { backgroundImage: 'none', border: '1px solid #333541' } } },
    MuiButton: { styleOverrides: { root: { minHeight: 44 } } },
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
