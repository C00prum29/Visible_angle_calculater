export {};

declare global {
  interface Landmark {
    x: number;
    y: number;
    z?: number;
    visibility?: number;
  }

  interface Results {
    image: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement;
    poseLandmarks?: Landmark[];
  }

  const POSE_CONNECTIONS: any;

  interface PoseOptions {
    modelComplexity?: number;
    smoothLandmarks?: boolean;
    enableSegmentation?: boolean;
    smoothSegmentation?: boolean;
    minDetectionConfidence?: number;
    minTrackingConfidence?: number;
  }

  interface PoseInstance {
    send: (input: any) => Promise<void>;
    onResults: (cb: (results: Results) => void) => void;
    setOptions: (options: PoseOptions) => void;
    close: () => void;
  }

  interface PoseConstructor {
    new (config: { locateFile: (file: string) => string }): PoseInstance;
  }

  interface Window {
    Pose: PoseConstructor;
    POSE_CONNECTIONS: any;
  }
}