import React, { useEffect, useState } from 'react';
import { styled } from '@mui/material';

const AnimationContainer = styled('div')({
  position: 'fixed',
  top: 0,
  left: 0,
  width: '100vw',
  height: '100vh',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  pointerEvents: 'none',
  zIndex: 9999,
  backgroundColor: 'rgba(0, 0, 0, 0.8)',
});

const TextContainer = styled('div')(({ theme }) => ({
  position: 'relative',
  width: '100%',
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  alignItems: 'center',
  gap: '20px',
  [theme.breakpoints.down('sm')]: {
    width: '98%',
    margin: '0 auto'
  }
}));

const FallingText = styled('div')<{ $active: boolean; $delay: number; $x: number }>(({ $active, $delay, $x }) => ({
  position: 'absolute',
  fontSize: '64px',
  fontWeight: 'bold',
  color: '#00ff00',
  textShadow: '0 0 10px #00ff00, 0 0 20px #00ff00, 0 0 30px #00ff00',
  opacity: $active ? 1 : 0,
  transform: $active ? 'translateY(0)' : 'translateY(-100vh)',
  transition: 'all 0.5s ease-in-out',
  textAlign: 'center',
  whiteSpace: 'nowrap',
  animation: $active ? `fallDown 4s ${$delay}s forwards` : 'none',
  '@keyframes fallDown': {
    '0%': {
      transform: 'translateY(-100vh)',
      opacity: 0,
    },
    '30%': {
      transform: 'translateY(0)',
      opacity: 1,
    },
    '70%': {
      transform: 'translateY(0)',
      opacity: 1,
      textShadow: '0 0 20px #00ff00, 0 0 40px #00ff00, 0 0 60px #00ff00',
    },
    '100%': {
      transform: 'translateY(100vh)',
      opacity: 0,
      textShadow: '0 0 40px #00ff00, 0 0 80px #00ff00, 0 0 120px #00ff00',
    },
  },
}));

interface SubmissionAnimationProps {
  show: boolean;
  onComplete: () => void;
}

const SubmissionAnimation: React.FC<SubmissionAnimationProps> = ({ show, onComplete }) => {
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (show) {
      setActive(true);
      const timer = setTimeout(() => {
        setActive(false);
        onComplete();
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [show, onComplete]);

  if (!show) return null;

  const textParts = [
    { text: '', delay: 0, x: 0 }, // Empty line for spacing
    { text: 'YOU SUBMITTED', delay: 0.2, x: -20 },
    { text: 'FOR A', delay: 0.4, x: 0 },
    { text: 'DEGEN POET PFP', delay: 0.6, x: 20 },
    { text: 'YOU CRAZY MFER', delay: 0.8, x: 0 },
  ];

  return (
    <AnimationContainer>
      <TextContainer>
        {textParts.map((part, index) => (
          <FallingText 
            key={index}
            $active={active}
            $delay={part.delay}
            $x={part.x}
            style={{
              top: `${15 * index}%`
            }}
          >
            {part.text}
          </FallingText>
        ))}
      </TextContainer>
    </AnimationContainer>
  );
};

export default SubmissionAnimation; 