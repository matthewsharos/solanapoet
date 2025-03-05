import React from 'react';

interface LoadingProps {
  size?: 'sm' | 'md' | 'lg';
  color?: string;
  className?: string;
  fullScreen?: boolean;
  text?: string;
}

const sizeMap = {
  sm: 'h-4 w-4',
  md: 'h-8 w-8',
  lg: 'h-12 w-12'
};

export const Loading: React.FC<LoadingProps> = ({
  size = 'md',
  color = 'blue',
  className = '',
  fullScreen = false,
  text
}) => {
  const spinnerSize = sizeMap[size];
  const colorClass = `text-${color}-600`;
  const containerClass = fullScreen
    ? 'fixed inset-0 flex items-center justify-center bg-white bg-opacity-75 z-50'
    : 'flex items-center justify-center';

  const spinner = (
    <>
      <svg
        className={`animate-spin ${spinnerSize} ${colorClass} ${className}`}
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        />
      </svg>
      {text && <span className="ml-2">{text}</span>}
    </>
  );

  if (fullScreen) {
    return <div className={containerClass}>{spinner}</div>;
  }

  return spinner;
};

interface LoadingOverlayProps extends LoadingProps {
  show: boolean;
}

export const LoadingOverlay: React.FC<LoadingOverlayProps> = ({
  show,
  ...props
}) => {
  if (!show) return null;

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-75 z-50">
      <Loading {...props} />
    </div>
  );
}; 