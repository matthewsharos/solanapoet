import React from 'react';
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom';
import { ThemeProvider as MuiThemeProvider, createTheme, CssBaseline } from '@mui/material';
import '@fontsource/dancing-script';
import '@fontsource/special-elite';
import './styles/cosmic_bowling.css';

// Import components
import Layout from './components/Layout';

// Import pages
import Market from './pages/Market';
import Mint from './pages/Mint';
import Requests from './pages/Requests';

// Import contexts
import { WalletProvider } from './contexts/WalletContext';
import { ThemeProvider } from './contexts/ThemeContext';

// Create a vintage-themed MUI theme
const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#2c2c2c',
    },
    secondary: {
      main: '#d4af37',
    },
    background: {
      default: '#f8f5e6',
      paper: '#f0ead6',
    },
    text: {
      primary: '#2c2c2c',
      secondary: '#5c5c5c',
    },
  },
  typography: {
    fontFamily: '"Special Elite", cursive',
    h1: {
      fontFamily: '"Dancing Script", cursive',
      fontSize: '3rem',
    },
    h2: {
      fontFamily: '"Dancing Script", cursive',
      fontSize: '2.5rem',
    },
    h3: {
      fontFamily: '"Dancing Script", cursive',
      fontSize: '2rem',
    },
    button: {
      fontFamily: '"Special Elite", cursive',
    },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 0,
          textTransform: 'none',
          padding: '8px 16px',
        },
        contained: {
          boxShadow: 'none',
          '&:hover': {
            boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.2)',
          },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: 0,
          backgroundImage: 'none',
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 0,
          border: '1px solid #d4af37',
          boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.1)',
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 0,
          },
        },
      },
    },
  },
});

const App: React.FC = () => {
  // Create router with the new createBrowserRouter API
  const router = createBrowserRouter([
    {
      path: '/',
      element: <Layout />,
      children: [
        {
          path: 'art',
          element: <Market />
        },
        {
          path: 'mint',
          element: <Mint />
        },
        {
          path: 'requests',
          element: <Requests />
        },
        {
          path: '',
          element: <Navigate to="/art" replace />
        },
        {
          path: '*',
          element: <Navigate to="/art" replace />
        }
      ]
    }
  ]);

  return (
    <ThemeProvider>
      <MuiThemeProvider theme={theme}>
        <CssBaseline enableColorScheme />
        <WalletProvider>
          <RouterProvider router={router} />
        </WalletProvider>
      </MuiThemeProvider>
    </ThemeProvider>
  );
};

export default App;
