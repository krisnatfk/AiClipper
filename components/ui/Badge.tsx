import { cn } from '@/lib/utils';

export interface BadgeProps {
  variant?: 'success' | 'alert' | 'energy' | 'accent' | 'default';
  children: React.ReactNode;
  className?: string;
}

export default function Badge({ variant = 'default', children, className }: BadgeProps) {
  const variants = {
    success: 'bg-success/10 text-success',
    alert: 'bg-alert/10 text-alert',
    energy: 'bg-energy/10 text-energy',
    accent: 'bg-accent/10 text-accent',
    default: 'bg-secondary/10 text-secondary',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium',
        variants[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
