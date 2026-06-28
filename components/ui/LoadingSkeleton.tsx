import { cn } from '@/lib/utils';

export interface LoadingSkeletonProps {
  className?: string;
  count?: number;
}

export default function LoadingSkeleton({ className, count = 1 }: LoadingSkeletonProps) {
  return (
    <>
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className={cn(
            'animate-pulse bg-card rounded',
            className
          )}
        />
      ))}
    </>
  );
}

export function ProjectCardSkeleton() {
  return (
    <div className="card p-4 space-y-3">
      <div className="h-40 bg-sidebar rounded animate-pulse" />
      <div className="space-y-2">
        <div className="h-4 bg-sidebar rounded w-3/4 animate-pulse" />
        <div className="h-3 bg-sidebar rounded w-1/2 animate-pulse" />
      </div>
      <div className="flex gap-2">
        <div className="h-6 bg-sidebar rounded w-20 animate-pulse" />
        <div className="h-6 bg-sidebar rounded w-16 animate-pulse" />
      </div>
    </div>
  );
}

export function ClipCardSkeleton() {
  return (
    <div className="card p-4 space-y-3">
      <div className="aspect-[9/16] bg-sidebar rounded animate-pulse" />
      <div className="space-y-2">
        <div className="h-5 bg-sidebar rounded w-full animate-pulse" />
        <div className="h-3 bg-sidebar rounded w-2/3 animate-pulse" />
      </div>
      <div className="flex gap-2">
        <div className="h-8 bg-sidebar rounded flex-1 animate-pulse" />
        <div className="h-8 bg-sidebar rounded flex-1 animate-pulse" />
      </div>
    </div>
  );
}
