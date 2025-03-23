import React from 'react';
import { Box, Button } from '@mui/material';
import { Refresh as RefreshIcon, Sort as SortIcon } from '@mui/icons-material';

interface ActionButtonsProps {
  onRefresh: () => void;
  onSort: () => void;
  sorted: boolean;
  isMobile: boolean;
}

const ActionButtons: React.FC<ActionButtonsProps> = ({ 
  onRefresh, 
  onSort, 
  sorted, 
  isMobile 
}) => {
  return (
    <Box sx={{ 
      display: 'flex', 
      justifyContent: isMobile ? 'center' : 'flex-end', 
      width: isMobile ? '100%' : 'auto' 
    }}>
      <Button 
        variant="contained" 
        onClick={onRefresh}
        sx={{ 
          mr: 1,
          backgroundColor: '#663399',
          '&:hover': { backgroundColor: '#42297a' }
        }}
        startIcon={<RefreshIcon />}
      >
        Refresh NFTs
      </Button>
      
      <Button
        variant="contained"
        onClick={onSort}
        sx={{
          backgroundColor: sorted ? '#4a7c59' : '#7c4a59',
          '&:hover': { backgroundColor: sorted ? '#3a6249' : '#6c3a49' }
        }}
        startIcon={<SortIcon />}
      >
        Sort by Date
      </Button>
    </Box>
  );
};

export default ActionButtons; 