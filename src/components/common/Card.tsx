import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  hoverable?: boolean;
  selected?: boolean;
}

export const Card: React.FC<CardProps> = ({
  children,
  className = '',
  onClick,
  hoverable = false,
  selected = false
}) => {
  const baseStyles = 'bg-white rounded-lg shadow-md overflow-hidden';
  const hoverStyles = hoverable ? 'hover:shadow-lg transition-shadow cursor-pointer' : '';
  const selectedStyles = selected ? 'ring-2 ring-blue-500' : '';

  return (
    <div
      className={`${baseStyles} ${hoverStyles} ${selectedStyles} ${className}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
    >
      {children}
    </div>
  );
};

interface CardHeaderProps {
  children: React.ReactNode;
  className?: string;
}

export const CardHeader: React.FC<CardHeaderProps> = ({
  children,
  className = ''
}) => (
  <div className={`p-4 border-b border-gray-200 ${className}`}>{children}</div>
);

interface CardBodyProps {
  children: React.ReactNode;
  className?: string;
}

export const CardBody: React.FC<CardBodyProps> = ({
  children,
  className = ''
}) => <div className={`p-4 ${className}`}>{children}</div>;

interface CardFooterProps {
  children: React.ReactNode;
  className?: string;
}

export const CardFooter: React.FC<CardFooterProps> = ({
  children,
  className = ''
}) => (
  <div className={`p-4 border-t border-gray-200 ${className}`}>{children}</div>
);

interface CardImageProps {
  src: string;
  alt: string;
  className?: string;
}

export const CardImage: React.FC<CardImageProps> = ({
  src,
  alt,
  className = ''
}) => (
  <div className="relative aspect-video">
    <img
      src={src}
      alt={alt}
      className={`w-full h-full object-cover ${className}`}
    />
  </div>
);

interface CardTitleProps {
  children: React.ReactNode;
  className?: string;
}

export const CardTitle: React.FC<CardTitleProps> = ({
  children,
  className = ''
}) => (
  <h3 className={`text-lg font-semibold ${className}`}>{children}</h3>
); 