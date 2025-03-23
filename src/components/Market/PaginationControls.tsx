import React from 'react';
import { Box, Pagination } from '@mui/material';

interface PaginationControlsProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (event: React.ChangeEvent<unknown>, value: number) => void;
  isMobile: boolean;
}

const PaginationControls: React.FC<PaginationControlsProps> = ({
  currentPage,
  totalPages,
  onPageChange,
  isMobile
}) => {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
      <Pagination 
        count={totalPages} 
        page={currentPage} 
        onChange={onPageChange}
        color="primary" 
        size={isMobile ? "small" : "medium"}
      />
    </Box>
  );
};

export default PaginationControls; 