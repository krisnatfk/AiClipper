import Badge from './Badge';
import { ProjectStage } from '@/types';

export interface StatusBadgeProps {
  stage: ProjectStage;
  className?: string;
}

export default function StatusBadge({ stage, className }: StatusBadgeProps) {
  const stageConfig: Record<
    ProjectStage,
    { variant: 'success' | 'alert' | 'energy' | 'accent' | 'default'; label: string }
  > = {
    PENDING: { variant: 'default', label: 'Pending' },
    QUEUED: { variant: 'accent', label: 'Queued' },
    IMPORT: { variant: 'accent', label: 'Importing' },
    CURATE: { variant: 'accent', label: 'Curating' },
    REFINE: { variant: 'accent', label: 'Refining' },
    RENDER: { variant: 'accent', label: 'Rendering' },
    UPLOAD: { variant: 'accent', label: 'Uploading' },
    COMPLETE: { variant: 'success', label: 'Complete' },
    STALLED: { variant: 'energy', label: 'Stalled' },
    FAILED: { variant: 'alert', label: 'Failed' },
  };

  const config = stageConfig[stage] || stageConfig.PENDING;

  return (
    <Badge variant={config.variant} className={className}>
      {config.label}
    </Badge>
  );
}
