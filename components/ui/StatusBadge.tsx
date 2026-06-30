import Badge from './Badge';
import { ProjectStage } from '@/types';

export interface StatusBadgeProps {
  stage: ProjectStage | string;
  className?: string;
}

export default function StatusBadge({ stage, className }: StatusBadgeProps) {
  const stageConfig: Record<
    string,
    { variant: 'success' | 'alert' | 'energy' | 'accent' | 'default'; label: string }
  > = {
    PENDING: { variant: 'default', label: 'Pending' },
    DRAFT: { variant: 'default', label: 'Draft' },
    UPLOADED: { variant: 'accent', label: 'Uploaded' },
    QUEUED: { variant: 'accent', label: 'Queued' },
    PROBING: { variant: 'accent', label: 'Probing' },
    EXTRACTING_AUDIO: { variant: 'accent', label: 'Extracting audio' },
    TRANSCRIBING: { variant: 'accent', label: 'Transcribing' },
    ANALYZING: { variant: 'accent', label: 'Analyzing' },
    PLANNING_CLIPS: { variant: 'accent', label: 'Planning clips' },
    RENDERING: { variant: 'accent', label: 'Rendering' },
    UPLOADING_OUTPUT: { variant: 'accent', label: 'Uploading output' },
    COMPLETED: { variant: 'success', label: 'Completed' },
    PARTIAL_COMPLETED: { variant: 'energy', label: 'Partial' },
    CANCELED: { variant: 'default', label: 'Canceled' },
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
