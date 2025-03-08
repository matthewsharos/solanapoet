import React, { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  IconButton,
  styled,
  useTheme,
  useMediaQuery,
  Box,
  Slider
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import ZoomOutIcon from '@mui/icons-material/ZoomOut';
import RestartAltIcon from '@mui/icons-material/RestartAlt';

interface ImageZoomModalProps {
  open: boolean;
  onClose: () => void;
  imageSrc: string;
  imageAlt: string;
}

const ZoomDialog = styled(Dialog)(({ theme }) => ({
  '& .MuiDialog-paper': {
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    margin: 0,
    maxWidth: '100vw',
    maxHeight: '100vh',
    width: '100vw',
    height: '100vh',
    borderRadius: 0,
    overflow: 'hidden',
  },
}));

const ZoomDialogContent = styled(DialogContent)({
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  padding: 0,
  overflow: 'hidden',
  width: '100%',
  height: '100%',
  position: 'relative',
});

const ImageContainer = styled(Box)({
  position: 'relative',
  width: '100%',
  height: '100%',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  overflow: 'hidden',
});

const ZoomableImage = styled('img')({
  maxWidth: '100%',
  maxHeight: '100%',
  objectFit: 'contain',
  transition: 'transform 0.3s ease-out',
  transformOrigin: 'center center',
  cursor: 'grab',
  '&:active': {
    cursor: 'grabbing',
  },
});

const ControlsContainer = styled(Box)(({ theme }) => ({
  position: 'absolute',
  bottom: 16,
  left: '50%',
  transform: 'translateX(-50%)',
  display: 'flex',
  alignItems: 'center',
  gap: theme.spacing(2),
  backgroundColor: 'rgba(0, 0, 0, 0.6)',
  borderRadius: 20,
  padding: theme.spacing(1, 2),
  zIndex: 10,
  [theme.breakpoints.down('sm')]: {
    width: '80%',
    justifyContent: 'center',
  },
}));

const CloseButton = styled(IconButton)(({ theme }) => ({
  position: 'absolute',
  top: 16,
  right: 16,
  color: '#fff',
  backgroundColor: 'rgba(0, 0, 0, 0.5)',
  padding: 8,
  zIndex: 10,
  '&:hover': {
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  [theme.breakpoints.down('sm')]: {
    top: 8,
    right: 8,
  },
}));

const StyledSlider = styled(Slider)({
  width: 120,
  color: 'white',
});

const ImageZoomModal: React.FC<ImageZoomModalProps> = ({ open, onClose, imageSrc, imageAlt }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [scale, setScale] = useState<number>(1);
  const [position, setPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [startPos, setStartPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const imageRef = useRef<HTMLImageElement>(null);

  // Reset zoom and position when modal opens
  useEffect(() => {
    if (open) {
      setScale(1);
      setPosition({ x: 0, y: 0 });
      setIsDragging(false);
    }
  }, [open]);

  const handleZoomIn = () => {
    setScale((prev) => Math.min(prev + 0.25, 5));
  };

  const handleZoomOut = () => {
    setScale((prev) => Math.max(prev - 0.25, 0.5));
  };

  const handleReset = () => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  };

  const handleSliderChange = (_event: Event, newValue: number | number[]) => {
    setScale(newValue as number);
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLImageElement>) => {
    if (scale > 1) {
      setIsDragging(true);
      setStartPos({
        x: e.clientX - position.x,
        y: e.clientY - position.y,
      });
    }
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLImageElement>) => {
    if (scale > 1 && e.touches.length === 1) {
      setIsDragging(true);
      setStartPos({
        x: e.touches[0].clientX - position.x,
        y: e.touches[0].clientY - position.y,
      });
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLImageElement>) => {
    if (isDragging && scale > 1) {
      setPosition({
        x: e.clientX - startPos.x,
        y: e.clientY - startPos.y,
      });
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLImageElement>) => {
    if (isDragging && scale > 1 && e.touches.length === 1) {
      setPosition({
        x: e.touches[0].clientX - startPos.x,
        y: e.touches[0].clientY - startPos.y,
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
  };

  // Handle double tap/click to zoom in and out
  const handleDoubleClick = (e: React.MouseEvent<HTMLImageElement>) => {
    if (scale > 1) {
      // If already zoomed in, reset
      handleReset();
    } else {
      // Zoom in to 2x
      setScale(2);
      if (imageRef.current) {
        const rect = imageRef.current.getBoundingClientRect();
        // Center on the clicked position
        setPosition({
          x: (rect.width / 2 - (e.clientX - rect.left)) * 2,
          y: (rect.height / 2 - (e.clientY - rect.top)) * 2,
        });
      }
    }
  };

  return (
    <ZoomDialog open={open} onClose={onClose} fullScreen>
      <ZoomDialogContent>
        <CloseButton onClick={onClose}>
          <CloseIcon />
        </CloseButton>
        
        <ImageContainer
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onTouchEnd={handleTouchEnd}
        >
          <ZoomableImage
            ref={imageRef}
            src={imageSrc}
            alt={imageAlt}
            style={{
              transform: `scale(${scale}) translate(${position.x / scale}px, ${position.y / scale}px)`,
              cursor: isDragging ? 'grabbing' : (scale > 1 ? 'grab' : 'zoom-in'),
            }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onDoubleClick={handleDoubleClick}
            draggable={false}
          />
        </ImageContainer>
        
        <ControlsContainer>
          <IconButton onClick={handleZoomOut} color="inherit" size={isMobile ? "small" : "medium"}>
            <ZoomOutIcon />
          </IconButton>
          
          <StyledSlider
            value={scale}
            onChange={handleSliderChange}
            min={0.5}
            max={5}
            step={0.1}
            aria-label="Zoom"
          />
          
          <IconButton onClick={handleZoomIn} color="inherit" size={isMobile ? "small" : "medium"}>
            <ZoomInIcon />
          </IconButton>
          
          <IconButton onClick={handleReset} color="inherit" size={isMobile ? "small" : "medium"}>
            <RestartAltIcon />
          </IconButton>
        </ControlsContainer>
      </ZoomDialogContent>
    </ZoomDialog>
  );
};

export default ImageZoomModal; 