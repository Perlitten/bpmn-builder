import { useId, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Button } from './Button';
import { Tooltip } from './Tooltip';

type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  label: string;
  children: ReactNode;
  variant?: 'accent' | 'danger' | 'ghost' | 'outline';
  tooltipSide?: 'bottom' | 'left' | 'right' | 'top';
};

export function IconButton({
  label,
  className = '',
  children,
  variant = 'ghost',
  tooltipSide = 'bottom',
  title,
  ...props
}: IconButtonProps) {
  const tooltipId = useId();
  return (
    <Button
      variant={variant}
      size="sm"
      className={`ui-icon-button ${className}`}
      aria-label={label}
      aria-describedby={tooltipId}
      {...props}
    >
      {children}
      <Tooltip id={tooltipId} side={tooltipSide}>{title ?? label}</Tooltip>
    </Button>
  );
}
