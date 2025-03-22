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
  Fade,
  CircularProgress
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import ZoomOutIcon from '@mui/icons-material/ZoomOut';
import RestartAltIcon from '@mui/icons-material/RestartAlt';

// TypeScript declaration for the global image cache
declare global {
  interface Window {
    nftImageCache: Map<string, boolean>;
  }
}

// Initialize global cache if it doesn't exist
if (typeof window !== 'undefined' && !window.nftImageCache) {
  window.nftImageCache = new Map<string, boolean>();
}

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

const LoadingOverlay = styled(Box)({
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  backgroundColor: 'rgba(0, 0, 0, 0.5)',
  zIndex: 5,
});

const StyledSlider = styled(Slider)({
  width: 120,
  color: 'white',
});

const ImageZoomModal: React.FC<ImageZoomModalProps> = ({ open, onClose, imageSrc, imageAlt }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [startPosition, setStartPosition] = useState({ x: 0, y: 0 });
  const [imageLoaded, setImageLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [showHint, setShowHint] = useState<boolean>(true);
  const [lastTap, setLastTap] = useState<number>(0);
  const imageRef = useRef<HTMLImageElement>(null);

  // Reset zoom and position when modal opens or image changes
  useEffect(() => {
    if (open) {
      setZoom(1);
      setPosition({ x: 0, y: 0 });
      setImageLoaded(false);
      setLoadError(false);
      
      // Preload the high-resolution image
      const preloadImage = () => {
        // Check if image is already cached
        if (window.nftImageCache.has(imageSrc)) {
          const isLoaded = window.nftImageCache.get(imageSrc);
          setImageLoaded(isLoaded || false);
          setLoadError(!isLoaded);
          return;
        }
        
        const img = new Image();
        
        img.onload = () => {
          window.nftImageCache.set(imageSrc, true);
          // Only update state if modal is still open
          if (open) {
            setImageLoaded(true);
            setLoadError(false);
          }
        };
        
        img.onerror = () => {
          window.nftImageCache.set(imageSrc, false);
          // Only update state if modal is still open
          if (open) {
            setImageLoaded(true);
            setLoadError(true);
          }
        };
        
        // If image is already cached by browser, onload may not fire
        if (img.complete) {
          window.nftImageCache.set(imageSrc, true);
          setImageLoaded(true);
          setLoadError(false);
        } else {
          // Start loading
          img.src = imageSrc;
        }
      };
      
      // Start preloading immediately
      preloadImage();
    }
  }, [open, imageSrc]);

  // Show hint when zoomed in
  useEffect(() => {
    if (zoom > 1) {
      setShowHint(true);
      const timer = setTimeout(() => {
        setShowHint(false);
      }, 2000);
      
      return () => clearTimeout(timer);
    }
  }, [zoom]);

  const handleZoomIn = () => {
    setZoom((prev) => Math.min(prev + 0.25, 5));
  };

  const handleZoomOut = () => {
    setZoom((prev) => Math.max(prev - 0.25, 0.5));
  };

  const handleReset = () => {
    setZoom(1);
    setPosition({ x: 0, y: 0 });
  };

  const handleSliderChange = (_event: Event, newValue: number | number[]) => {
    setZoom(newValue as number);
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLImageElement>) => {
    if (zoom > 1) {
      setIsDragging(true);
      setDragStart({
        x: e.clientX - position.x,
        y: e.clientY - position.y,
      });
    }
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLImageElement>) => {
    if (zoom > 1 && e.touches.length === 1) {
      setIsDragging(true);
      setStartPosition({
        x: e.touches[0].clientX - position.x,
        y: e.touches[0].clientY - position.y,
      });
    }
    
    // Handle double tap to exit when not zoomed
    const now = Date.now();
    if (zoom === 1 && now - lastTap < 300) {
      onClose();
    }
    setLastTap(now);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLImageElement>) => {
    if (isDragging && zoom > 1) {
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLImageElement>) => {
    if (isDragging && zoom > 1 && e.touches.length === 1) {
      setPosition({
        x: e.touches[0].clientX - startPosition.x,
        y: e.touches[0].clientY - startPosition.y,
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
    if (zoom > 1) {
      // If already zoomed in, reset
      handleReset();
    } else {
      // Zoom in to 2x
      setZoom(2);
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
    if (zoom === 1) {
      onClose();
    }
  };

  return (
    <ZoomDialog
      open={open}
      onClose={onClose}
      maxWidth={false}
      fullWidth
      TransitionComponent={Fade}
      transitionDuration={300}
    >
      <ZoomDialogContent onClick={handleBackgroundClick}>
        <CloseButton onClick={onClose} aria-label="close">
          <CloseIcon />
        </CloseButton>
        
        {/* Mobile hint that appears at the top */}
        {isMobile && (
          <Fade in={showHint} timeout={300}>
            <MobileExitHint>
              <Typography variant="body2">
                {zoom > 1 
                  ? "Reset zoom or use ✕ to exit" 
                  : "Tap image to exit, double-tap to zoom"}
              </Typography>
              <CloseIcon fontSize="small" />
            </MobileExitHint>
          </Fade>
        )}
        
        {/* Background overlay that can be tapped to exit when not zoomed */}
        {zoom === 1 && (
          <BackgroundOverlay onClick={handleBackgroundClick} />
        )}
        
        <ImageContainer>
          {!imageLoaded && !loadError && (
            <LoadingOverlay>
              <Box textAlign="center">
                <CircularProgress color="inherit" size={50} thickness={4} />
                <Typography variant="body2" color="white" sx={{ mt: 2 }}>
                  Loading high resolution image...
                </Typography>
              </Box>
            </LoadingOverlay>
          )}
          
          {loadError && (
            <Box textAlign="center" color="white">
              <Typography variant="h6">
                Unable to load image
              </Typography>
            </Box>
          )}
          
          <ZoomableImage
            ref={imageRef}
            src={imageSrc}
            alt={imageAlt}
            style={{
              transform: `translate(${position.x}px, ${position.y}px) scale(${zoom})`,
              opacity: imageLoaded && !loadError ? 1 : 0.3,
              transition: isDragging ? 'none' : 'transform 0.3s ease-out, opacity 0.3s ease'
            }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onDoubleClick={handleDoubleClick}
            onClick={(e) => e.stopPropagation()}
            onLoad={() => {
              setImageLoaded(true);
              window.nftImageCache.set(imageSrc, true);
            }}
            onError={() => {
              setLoadError(true);
              window.nftImageCache.set(imageSrc, false);
            }}
            draggable={false}
          />
        </ImageContainer>
        
        <ControlsContainer onClick={(e) => e.stopPropagation()}>
          <IconButton onClick={handleZoomOut} disabled={zoom <= 1} size="small" color="inherit">
            <ZoomOutIcon />
          </IconButton>
          
          <Slider
            value={zoom}
            min={1}
            max={3}
            step={0.1}
            onChange={handleSliderChange}
            sx={{
              width: isMobile ? '50%' : 150,
              color: 'white',
              '& .MuiSlider-thumb': {
                width: 16,
                height: 16,
              },
            }}
          />
          
          <IconButton onClick={handleZoomIn} disabled={zoom >= 3} size="small" color="inherit">
            <ZoomInIcon />
          </IconButton>
          
          <IconButton onClick={handleReset} disabled={zoom === 1 && position.x === 0 && position.y === 0} size="small" color="inherit">
            <RestartAltIcon />
          </IconButton>
        </ControlsContainer>
      </ZoomDialogContent>
    </ZoomDialog>
  );
};

export default ImageZoomModal; 