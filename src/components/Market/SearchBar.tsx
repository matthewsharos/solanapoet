import React from 'react';
import { TextField, InputAdornment } from '@mui/material';
import { Search as SearchIcon } from '@mui/icons-material';

interface SearchBarProps {
  searchQuery: string;
  onSearchChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  isMobile: boolean;
}

const SearchBar: React.FC<SearchBarProps> = ({ searchQuery, onSearchChange, isMobile }) => {
  return (
    <TextField
      placeholder="Search NFTs..."
      variant="outlined"
      size="small"
      value={searchQuery}
      onChange={onSearchChange}
      sx={{ mb: isMobile ? 2 : 0, width: isMobile ? '100%' : '300px' }}
      InputProps={{
        startAdornment: (
          <InputAdornment position="start">
            <SearchIcon />
          </InputAdornment>
        ),
      }}
    />
  );
};

export default SearchBar; 