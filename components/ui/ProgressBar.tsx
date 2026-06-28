import { cn } from '@/lib/utils';

export interface ProgressBarProps {
  progress: number; // 0-100
  stage?: string;
  className?: string;
  showPercentage?: boolean;
}

export default function ProgressBar({
  progress,
  stage,
  className,
  showPercentage = true,
}: ProgressBarProps) {
  // Clamp progress between 0 and 100
  const clampedProgress = Math.min(Math.max(progress, 0), 100);

  // Determine color based on progress
  const getProgressColor = () => {
    if (clampedProgress < 30) return 'bg-energy'; // Yellow for early stages
    if (clampedProgress < 70) return 'bg-accent'; // Blue for mid stages
    return 'bg-success'; // Green for final stages
  };

  return (
    <div className={cn('w-full space-y-2', className)}>
      {/* Progress Info */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-secondary">
          {stage ? `${stage}...` : 'Processing...'}
        </span>
        {showPercentage && (
          <span className="text-primary font-semibold">
            {clampedProgress}%
          </span>
        )}
      </div>

      {/* Progress Bar */}
      <div className="w-full h-2 bg-sidebar rounded-full overflow-hidden">
        <div
          className={cn(
            'h-full transition-all duration-500 ease-out rounded-full',
            getProgressColor()
          )}
          style={{ width: `${clampedProgress}%` }}
        />
      </div>
    </div>
  );
}
