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
    primary: { main: '#7dd3fc', dark: '#3287ad' },
    secondary: { main: '#c4b5fd' },
    background: { default: '#0b1120', paper: '#121e30' },
    text: { primary: '#eef5ff', secondary: '#a0b2ca' },
    divider: '#293a52',
  },
  typography: { fontFamily: 'Roboto, sans-serif', button: { textTransform: 'none' } },
  shape: { borderRadius: 12 },
  components: {
    MuiPaper: { defaultProps: { elevation: 0 }, styleOverrides: { root: { backgroundImage: 'none', border: '1px solid #293a52' } } },
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
