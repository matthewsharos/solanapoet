import React, { useState, useRef, useEffect } from 'react';
import { Link, useLocation, Outlet, Navigate } from 'react-router-dom';
import { AppBar, Toolbar, Typography, Box, Container, Button, styled, Paper, Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material';
import { useWalletContext } from '../contexts/WalletContext';
import DisplayNameEditor from './DisplayNameEditor';
import ThemeToggle from './ThemeToggle';

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

// Add styled component for the monkey image
const MonkeyImage = styled('img')({
  height: '40px',
  cursor: 'pointer',
  filter: 'drop-shadow(0 0 3px rgba(0,0,0,0.3))',
  transition: 'transform 0.2s ease',
  '&:hover': {
    transform: 'scale(1.1)'
  },
  '&:hover, &:focus, &:active': {
    boxShadow: 'none',
    outline: 'none'
  }
});

interface LayoutProps {
  children?: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const location = useLocation();
  const { publicKey, connected, isAuthorizedMinter, connect, disconnect } = useWalletContext();
  
  const [isInkSqueezing, setIsInkSqueezing] = useState(false);
  const logoRef = useRef<HTMLDivElement>(null);
  const [showConnectPopup, setShowConnectPopup] = useState(false);
  const [showNameEditor, setShowNameEditor] = useState(false);
  
  const isActive = (path: string) => {
    return location.pathname === path;
  };

  const handleLogoClick = () => {
    setIsInkSqueezing(true);
    setTimeout(() => setIsInkSqueezing(false), 1500); // Match animation duration
  };

  const handleMonkeyClick = () => {
    if (connected) {
      setShowNameEditor(true);
    } else {
      setShowConnectPopup(true);
    }
  };

  // Redirect from mint page if not authorized
  if (location.pathname === '/mint' && (!connected || !isAuthorizedMinter)) {
    return <Navigate to="/art" replace />;
  }

  return (
    <PageContainer>
      <VintageAppBar position="static">
        <Toolbar sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <Box sx={{ flexGrow: 1, display: 'flex', alignItems: 'center', gap: '16px' }}>
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
          <Box sx={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <MonkeyContainer>
              <MonkeyImage 
                src="/src/assets/images/monkey.png" 
                alt="Set Display Name" 
                onClick={handleMonkeyClick} 
              />
            </MonkeyContainer>
            
            <WalletButton onClick={disconnect} disabled={!connected}>
              {connected ? `Disconnect (${publicKey?.toString().slice(0, 4)}...${publicKey?.toString().slice(-4)})` : 'Connect'}
            </WalletButton>
            
            <ThemeToggle />
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

      {/* Wallet connect popup */}
      <Dialog
        open={showConnectPopup}
        onClose={() => setShowConnectPopup(false)}
        PaperProps={{
          style: {
            backgroundColor: '#f8f5e6',
            border: '1px solid #d4af37',
            borderRadius: '8px',
            maxWidth: '400px',
            width: '100%',
          }
        }}
      >
        <DialogTitle sx={{ fontFamily: '"Special Elite", cursive', textAlign: 'center' }}>
          Connect Your Wallet
        </DialogTitle>
        <DialogContent>
          <Typography variant="body1" sx={{ mb: 2 }}>
            Connect your Solana wallet to mint and view your NFTs.
          </Typography>
          <Button
            fullWidth
            variant="contained"
            onClick={connect}
            sx={{
              backgroundColor: '#e8e8e8',
              color: '#333333',
              padding: '12px',
              fontFamily: 'Arial, sans-serif',
              fontWeight: 'bold',
              '&:hover': {
                backgroundColor: '#d0d0d0',
              },
              marginBottom: '8px'
            }}
          >
            Connect Phantom Wallet
          </Button>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowConnectPopup(false)} color="inherit">
            Cancel
          </Button>
        </DialogActions>
      </Dialog>
      
      {/* Display name editor */}
      <DisplayNameEditor
        open={showNameEditor}
        onClose={() => setShowNameEditor(false)}
      />
    </PageContainer>
  );
};

export default Layout; 