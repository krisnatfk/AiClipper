export type ReframeMode =
  | 'fit-blur'
  | 'face-center-crop'
  | 'person-center-crop'
  | 'manual-crop'
  | 'manual-keyframe';

export type SubjectKind = 'face' | 'person';

export interface FrameSample {
  framePath: string;
  timestamp: number;
  width: number;
  height: number;
}

export interface DetectionBox {
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
}

export interface TimedDetection<T extends DetectionBox = DetectionBox> {
  timestamp: number;
  faces?: T[];
  persons?: T[];
}

export interface SubjectBox extends DetectionBox {
  kind: SubjectKind;
  timestamp: number;
  score?: number;
}

export interface CropBox {
  timestamp: number;
  x: number;
  y: number;
  width: number;
  height: number;
  mode?: ReframeMode;
  subjectKind?: SubjectKind;
  confidence?: number;
}

export interface ManualCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ManualCropKeyframe extends ManualCrop {
  timestamp: number;
}

export interface SafeAreaConfig {
  caption: boolean;
  hook: boolean;
}

export interface ReframeConfig {
  id?: number;
  clipId: string;
  mode: ReframeMode;
  fallbackMode: ReframeMode;
  aspectRatio: '9:16';
  outputWidth: number;
  outputHeight: number;
  faceDetections: TimedDetection[];
  personDetections: TimedDetection[];
  selectedSubjects: SubjectBox[];
  cropBoxes: CropBox[];
  smoothedCropBoxes: CropBox[];
  manualCrop?: ManualCrop | null;
  manualKeyframes: ManualCropKeyframe[];
  safeArea: SafeAreaConfig;
  createdAt?: string;
  updatedAt?: string;
}

export interface ReframeAnalysisResult {
  mode: ReframeMode;
  fallbackMode: ReframeMode;
  width: number;
  height: number;
  outputWidth: number;
  outputHeight: number;
  faceDetections: TimedDetection[];
  personDetections: TimedDetection[];
  selectedSubjects: SubjectBox[];
  cropBoxes: CropBox[];
  smoothedCropBoxes: CropBox[];
  tracked: boolean;
}
