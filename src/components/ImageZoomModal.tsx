import React, { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  IconButton,
  styled,
  useTheme,
  useMediaQuery,
  Box,
  Slider,
  Typography,
  Fade
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

// Enhanced mobile-friendly close button
const CloseButton = styled(IconButton)(({ theme }) => ({
  position: 'absolute',
  top: 16,
  right: 16,
  color: '#fff',
  backgroundColor: 'rgba(0, 0, 0, 0.7)',
  padding: 12,
  zIndex: 100, // Higher z-index to always be on top
  '&:hover': {
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
  },
  [theme.breakpoints.down('sm')]: {
    top: 42, // Increased from 12px to 42px (30px lower) to prevent being cut off
    right: 12,
    padding: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
  },
}));

// Mobile exit hint that appears when zoomed in
const MobileExitHint = styled(Box)(({ theme }) => ({
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  padding: theme.spacing(1.5),
  backgroundColor: 'rgba(0, 0, 0, 0.7)',
  color: 'white',
  textAlign: 'center',
  zIndex: 90, // High but below close button
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  gap: theme.spacing(1),
  [theme.breakpoints.down('sm')]: {
    top: 0, // Keep at top but adjust padding
    paddingTop: theme.spacing(6), // Add more top padding on mobile to clear status bar
    paddingBottom: theme.spacing(2),
  },
}));

// Background overlay that can be tapped to exit when not zoomed
const BackgroundOverlay = styled(Box)({
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  zIndex: 5, // Above the image but below controls
});

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
  const [showHint, setShowHint] = useState<boolean>(true);
  const [lastTap, setLastTap] = useState<number>(0);
  const imageRef = useRef<HTMLImageElement>(null);

  // Reset zoom and position when modal opens
  useEffect(() => {
    if (open) {
      setScale(1);
      setPosition({ x: 0, y: 0 });
      setIsDragging(false);
      setShowHint(true);
      
      // Hide the hint after 3 seconds
      const timer = setTimeout(() => {
        setShowHint(false);
      }, 3000);
      
      return () => clearTimeout(timer);
    }
  }, [open]);

  // Show hint when zoomed in
  useEffect(() => {
    if (scale > 1) {
      setShowHint(true);
      const timer = setTimeout(() => {
        setShowHint(false);
      }, 2000);
      
      return () => clearTimeout(timer);
    }
  }, [scale]);

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
    
    // Handle double tap to exit when not zoomed
    const now = Date.now();
    if (scale === 1 && now - lastTap < 300) {
      onClose();
    }
    setLastTap(now);
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
  
  // Handle background click/tap to exit when not zoomed in
  const handleBackgroundClick = () => {
    if (scale === 1) {
      onClose();
    }
  };

  return (
    <ZoomDialog open={open} onClose={onClose} fullScreen>
      <ZoomDialogContent>
        {/* Enhanced close button */}
        <CloseButton onClick={onClose} aria-label="Close zoom view">
          <CloseIcon fontSize={isMobile ? "medium" : "large"} />
        </CloseButton>
        
        {/* Mobile hint that appears at the top */}
        {isMobile && (
          <Fade in={showHint} timeout={300}>
            <MobileExitHint>
              <Typography variant="body2">
                {scale > 1 
                  ? "Reset zoom or use ✕ to exit" 
                  : "Tap image to exit, double-tap to zoom"}
              </Typography>
              <CloseIcon fontSize="small" />
            </MobileExitHint>
          </Fade>
        )}
        
        {/* Background overlay that can be tapped to exit when not zoomed */}
        {scale === 1 && (
          <BackgroundOverlay onClick={handleBackgroundClick} />
        )}
        
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