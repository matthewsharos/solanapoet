import React, { useState, useRef, useEffect } from 'react';
import { Link, useLocation, Outlet, Navigate } from 'react-router-dom';
import { AppBar, Toolbar, Typography, Box, Container, Button, styled, Paper, Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material';
import { useWalletContext } from '../contexts/WalletContext';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import DisplayNameEditor from './DisplayNameEditor';
import ThemeToggle from './ThemeToggle';
import { useTheme } from '../contexts/ThemeContext';

// Public URLs for the monkey images
const MONKEY_IMAGE_URL = "/images/monkey.png";
const DARK_MONKEY_IMAGE_URL = "/images/dark_monkey.png";

// Styled components for vintage look
const VintageAppBar = styled(AppBar)(({ theme }) => ({
  backgroundColor: 'rgba(255, 255, 255, 0.65)',
  backdropFilter: 'blur(15px)',
  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)',
  border: '1px solid rgba(255, 255, 255, 0.5)',
  borderBottom: '1px solid rgba(255, 255, 255, 0.8)',
  borderRadius: '0',
  position: 'relative',
  overflow: 'hidden',
  '&::after': {
    content: '""',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '60%',
    background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.6) 0%, rgba(255, 255, 255, 0.15) 50%, rgba(255, 255, 255, 0) 100%)',
    pointerEvents: 'none',
  },
  '&::before': {
    content: '""',
    position: 'absolute',
    bottom: -20,
    left: '0%',
    width: '100%',
    height: '30px',
    background: 'rgba(0, 0, 0, 0.15)',
    filter: 'blur(15px)',
    zIndex: -1,
  },
  // Bubble-like imperfections in the glass
  background: `
    linear-gradient(to right, rgba(255, 255, 255, 0.65), rgba(255, 255, 255, 0.65)),
    radial-gradient(circle at 30% 40%, rgba(200, 240, 255, 0.1) 0%, rgba(255, 255, 255, 0) 20%),
    radial-gradient(circle at 70% 30%, rgba(200, 240, 255, 0.15) 0%, rgba(255, 255, 255, 0) 25%),
    radial-gradient(circle at 50% 60%, rgba(220, 240, 255, 0.1) 0%, rgba(255, 255, 255, 0) 30%),
    radial-gradient(circle at 20% 70%, rgba(200, 240, 255, 0.05) 0%, rgba(255, 255, 255, 0) 15%)
  `,
  // Subtle blue tint like a windshield
  '&:after, &:before': {
    content: '""',
    position: 'absolute',
    inset: 0,
    background: 'rgba(200, 230, 255, 0.05)',
    pointerEvents: 'none',
  }
}));

const VintageLogo = styled(Typography)(({ theme }) => ({
  fontFamily: '"Satisfy", "Dancing Script", cursive',
  fontSize: '2.4rem',
  color: '#000',
  marginRight: '1.5rem',
  textShadow: '2px 2px 3px rgba(0,0,0,0.2)',
  fontWeight: '600',
  cursor: 'pointer',
  position: 'relative',
  transition: 'all 0.3s ease',
  '&:hover': {
    textShadow: '3px 3px 5px rgba(0, 0, 0, 0.25)',
  },
  '&::after': {
    content: '""',
    position: 'absolute',
    bottom: -5,
    left: '50%',
    width: 0,
    height: 0,
    background: '#000',
    borderRadius: '50%',
    transform: 'translateX(-50%)',
    opacity: 0,
    transition: 'all 0.5s ease',
  },
  '&.ink-squeeze::after': {
    width: '30px',
    height: '10px',
    opacity: 1,
    filter: 'blur(2px)',
    animation: 'inkDrip 1.5s ease-out',
  },
  '@keyframes inkDrip': {
    '0%': {
      width: '3px',
      height: '3px',
      opacity: 0.9,
    },
    '30%': {
      width: '30px',
      height: '10px',
      opacity: 1,
    },
    '100%': {
      width: '40px',
      height: '8px',
      opacity: 0,
      transform: 'translateX(-50%) translateY(20px)',
    }
  }
}));

// Updated styled components for buttons to match the image style
const ModernButtonStyle = styled(Button)(({ theme }) => ({
  fontFamily: '"Arial", "Helvetica", sans-serif',
  fontSize: '0.9rem',
  letterSpacing: '0.05rem',
  fontWeight: '500',
  textTransform: 'uppercase',
  backgroundColor: '#e8e8e8',
  color: '#333333',
  padding: '8px 24px',
  borderRadius: '4px',
  boxShadow: '0 4px 0 #222222',
  border: 'none',
  position: 'relative',
  transition: 'all 0.1s ease',
  '&:hover': {
    backgroundColor: '#f0f0f0',
    transform: 'translateY(0)',
    boxShadow: '0 4px 0 #222222',
  },
  '&:active': {
    backgroundColor: '#d8d8d8',
    transform: 'translateY(4px)',
    boxShadow: '0 0px 0 #222222',
  },
}));

const NavButton = styled(Button)(({ theme }) => ({
  fontFamily: '"Arial", "Helvetica", sans-serif',
  fontWeight: '500',
  fontSize: '0.9rem',
  letterSpacing: '0.05rem',
  textTransform: 'uppercase',
  color: 'black',
  backgroundColor: 'transparent',
  border: 'none',
  '&:hover': {
    textShadow: '0 0 5px rgba(0, 0, 0, 0.5)',
  },
}));

const ActiveNavButton = styled(NavButton)(({ theme }) => ({
  borderBottom: '2px solid #8b4513',
}));

const Footer = styled(Box)(({ theme }) => ({
  backgroundColor: '#d2b48c',
  padding: theme.spacing(2),
  marginTop: 'auto',
  borderTop: '2px solid #8b4513',
  textAlign: 'center',
  fontFamily: '"Arial", "Helvetica", sans-serif',
  color: '#5c4033',
}));

const PageContainer = styled(Box)(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  minHeight: '100vh',
  width: '100%',
  margin: '0',
  padding: '0',
  backgroundImage: 'none',
  backgroundColor: '#f5f5dc',
}));

const ContentContainer = styled(Container)(({ theme }) => ({
  flex: 1,
  padding: theme.spacing(4),
  marginTop: theme.spacing(2),
  marginBottom: theme.spacing(2),
  maxWidth: '100%',
}));

const ContentPaper = styled(Paper)(({ theme }) => ({
  padding: theme.spacing(3),
  backgroundColor: 'rgba(255, 250, 240, 0.9)',
  borderRadius: '4px',
  boxShadow: '0px 3px 15px rgba(0,0,0,0.2)',
  border: '1px solid #8b4513',
}));

const WalletButton = styled(ModernButtonStyle)({
  margin: '0 8px',
});

// Create styled Link components to fix the component prop issues
const StyledLink = styled(Link)({
  textDecoration: 'none',
});

// Add styled component for the display name button
const DisplayNameButton = styled(Button)({
  fontFamily: '"Arial", "Helvetica", sans-serif',
  fontSize: '0.85rem',
  letterSpacing: '0.05rem',
  fontWeight: '500',
  backgroundColor: '#f0ead6',
  color: '#333333',
  padding: '6px 12px',
  margin: '0 8px',
  borderRadius: '4px',
  border: '1px solid #d4af37',
  '&:hover': {
    backgroundColor: '#e6ddc4',
  },
});

// Add styled component for the monkey icon container
const MonkeyContainer = styled(Box)({
  position: 'relative',
  '&:hover, &:focus, &:active': {
    boxShadow: 'none',
    outline: 'none'
  }
});

// Update the MonkeyImage component to use the theme-aware image
const MonkeyImage = styled('img')(({ theme }) => ({
  cursor: 'pointer',
  width: '32px',
  height: '32px',
  transition: 'transform 0.2s, opacity 0.2s',
  '&:hover': {
    transform: 'scale(1.1)',
  },
  '&[data-connected="false"]': {
    cursor: 'not-allowed',
    opacity: 0.6,
  },
}));

const WalletButtonWrapper = styled(Box)(({ theme }) => ({
  '& .wallet-adapter-button': {
    backgroundColor: '#e8e8e8',
    color: '#333333',
    fontFamily: 'Arial, sans-serif',
    fontSize: '14px',
    fontWeight: 'bold',
    padding: '10px 20px',
    borderRadius: '4px',
    border: '1px solid #d4af37',
    '&:hover': {
      backgroundColor: '#d0d0d0',
    },
    '&:not(:disabled):hover': {
      backgroundColor: '#d0d0d0',
    },
  },
  '& .wallet-adapter-button-trigger': {
    backgroundColor: '#e8e8e8',
    '&::after': {
      content: '"CONNECT"',
      display: 'inline',
    },
    '& .wallet-adapter-button-start-icon': {
      marginRight: 0,
    },
    '& .wallet-adapter-button-end-icon': {
      marginLeft: 4,
      marginRight: 0,
    },
    '& > *:not(.wallet-adapter-button-start-icon):not(.wallet-adapter-button-end-icon)': {
      display: 'none',
    },
  },
  '& .wallet-adapter-dropdown-list': {
    backgroundColor: '#f8f5e6',
  },
  '& .wallet-adapter-dropdown-list-item': {
    backgroundColor: '#e8e8e8',
    color: '#333333',
    fontFamily: 'Arial, sans-serif',
    fontSize: '14px',
    fontWeight: 'bold',
    '&:hover': {
      backgroundColor: '#d0d0d0',
    },
  },
}));

interface LayoutProps {
  children?: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const location = useLocation();
  const { publicKey, connected, isAuthorizedMinter } = useWalletContext();
  const { isDarkMode } = useTheme();
  
  const [isInkSqueezing, setIsInkSqueezing] = useState(false);
  const logoRef = useRef<HTMLDivElement>(null);
  const [showNameEditor, setShowNameEditor] = useState(false);
  
  const isActive = (path: string) => {
    return location.pathname === path;
  };

  const handleLogoClick = () => {
    setIsInkSqueezing(true);
    setTimeout(() => setIsInkSqueezing(false), 1500); // Match animation duration
  };

  const handleMonkeyClick = () => {
    if (connected && publicKey) {
      console.log('Opening display name editor');
      setShowNameEditor(true);
    } else {
      console.log('Wallet not connected');
    }
  };

  // Redirect from mint page if not authorized
  if (location.pathname === '/mint' && (!connected || !isAuthorizedMinter)) {
    return <Navigate to="/art" replace />;
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <VintageAppBar position="static">
        <Toolbar sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: { xs: 2, sm: 0 }, py: { xs: 2, sm: 1 } }}>
          {/* First row: Logo and navigation */}
          <Box sx={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <Link to="/art" style={{ textDecoration: 'none' }}>
                <div ref={logoRef}>
                  <VintageLogo className={isInkSqueezing ? 'ink-squeeze' : ''} onClick={handleLogoClick}>
                    Degen Poet
                  </VintageLogo>
                </div>
              </Link>
              <StyledLink to="/art">
                {isActive('/art') ? (
                  <ActiveNavButton>Art</ActiveNavButton>
                ) : (
                  <NavButton>Art</NavButton>
                )}
              </StyledLink>
              {connected && isAuthorizedMinter && (
                <StyledLink to="/mint">
                  {isActive('/mint') ? (
                    <ActiveNavButton>Mint</ActiveNavButton>
                  ) : (
                    <NavButton>Mint</NavButton>
                  )}
                </StyledLink>
              )}
              <StyledLink to="/requests">
                {isActive('/requests') ? (
                  <ActiveNavButton>Requests</ActiveNavButton>
                ) : (
                  <NavButton>Requests</NavButton>
                )}
              </StyledLink>
            </Box>
            
            {/* Only show theme toggle in first row */}
            <Box sx={{ display: { xs: 'flex', sm: 'none' } }}>
              <ThemeToggle />
            </Box>
          </Box>
          
          {/* Second row on mobile: Monkey icon and wallet button */}
          <Box 
            sx={{ 
              display: 'flex', 
              alignItems: 'center', 
              width: { xs: '100%', sm: 'auto' },
              justifyContent: { xs: 'space-between', sm: 'flex-end' },
              gap: '16px' 
            }}
          >
            <MonkeyContainer>
              <MonkeyImage 
                src={isDarkMode ? DARK_MONKEY_IMAGE_URL : MONKEY_IMAGE_URL}
                alt="Set Display Name" 
                onClick={handleMonkeyClick}
                data-connected={connected}
                className="monkey-icon"
              />
            </MonkeyContainer>
            
            <WalletButtonWrapper>
              <WalletMultiButton />
            </WalletButtonWrapper>
            
            {/* Hide theme toggle in second row on mobile, but show on desktop */}
            <Box sx={{ display: { xs: 'none', sm: 'flex' } }}>
              <ThemeToggle />
            </Box>
          </Box>
        </Toolbar>
      </VintageAppBar>
      
      <ContentContainer maxWidth="lg">
        <ContentPaper>
          {children || <Outlet />}
        </ContentPaper>
      </ContentContainer>
      
      <Footer>
        <Typography variant="caption" sx={{ fontFamily: '"Arial", "Helvetica", sans-serif', fontWeight: 300, fontSize: '0.75rem' }}>
          &copy; 2025 Degen Poet LLC. All rights reserved.
        </Typography>
        <Typography variant="caption" sx={{ mt: 0.5, fontFamily: '"Arial", "Helvetica", sans-serif', fontWeight: 300, fontSize: '0.75rem' }}>
          Powered by Solana Blockchain
        </Typography>
      </Footer>
      
      {/* Display name editor */}
      <DisplayNameEditor
        open={showNameEditor}
        onClose={() => {
          console.log('Closing display name editor');
          setShowNameEditor(false);
        }}
      />
    </Box>
  );
};

export default Layout; 