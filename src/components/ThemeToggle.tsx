import React from 'react';
import { IconButton, styled } from '@mui/material';
import Brightness7Icon from '@mui/icons-material/Brightness7';
import Brightness4Icon from '@mui/icons-material/Brightness4';
import { useTheme } from '../contexts/ThemeContext';

const StyledIconButton = styled(IconButton)(({ theme }) => ({
  marginLeft: theme.spacing(2),
  transition: 'all 0.3s ease',
  '&:hover': {
    transform: 'scale(1.1)',
  },
  '&[data-theme="dark"]': {
    color: '#00ffff',
    textShadow: '0 0 10px #00ffff',
    '&:hover': {
      transform: 'scale(1.1) rotate(180deg)',
    },
  },
}));

const ThemeToggle: React.FC = () => {
  const { isDarkMode, toggleTheme } = useTheme();

  return (
    <StyledIconButton
      onClick={toggleTheme}
      data-theme={isDarkMode ? 'dark' : 'light'}
      aria-label="toggle theme"
    >
      {isDarkMode ? <Brightness7Icon /> : <Brightness4Icon />}
    </StyledIconButton>
  );
};

export default ThemeToggle; 