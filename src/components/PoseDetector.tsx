import { useEffect, useRef, useState, useCallback } from 'react';
import { LimbType, Landmark } from '../types';
import { calculateAngle, getLimbLandmarks } from '../utils/angleCalculator';

declare global {
  interface Window {
    Pose: new (config: { locateFile: (file: string) => string }) => {
      setOptions: (options: Record<string, unknown>) => void;
      onResults: (callback: (results: PoseResults) => void) => void;
      send: (input: { image: HTMLVideoElement }) => Promise<void>;
      close: () => void;
    };
    Camera: new (
      video: HTMLVideoElement,
      config: {
        onFrame: () => Promise<void>;
        width: number;
        height: number;
        facingMode?: 'user' | 'environment';
      }
    ) => {
      start: () => Promise<void>;
      stop: () => void;
    };
    drawConnectors: (
      ctx: CanvasRenderingContext2D,
      landmarks: Landmark[],
      connections: [number, number][],
      style: { color: string; lineWidth: number }
    ) => void;
    drawLandmarks: (
      ctx: CanvasRenderingContext2D,
      landmarks: Landmark[],
      style: { color: string; lineWidth: number; radius: number }
    ) => void;
    POSE_CONNECTIONS: [number, number][];
  }
}

interface PoseResults {
  image: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement;
  poseLandmarks?: Landmark[];
}

interface PoseDetectorProps {
  selectedLimb: LimbType;
  onAngleUpdate: (angle: number) => void;
}

function isMobileDevice(): boolean {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

function getInitialCanvasSize() {
  const isMobile = isMobileDevice();
  if (isMobile) {
    const width = Math.min(window.innerWidth - 32, 640);
    const height = Math.round((width * 3) / 4);
    return { width, height };
  }
  return { width: 640, height: 480 };
}

export function PoseDetector({ selectedLimb, onAngleUpdate }: PoseDetectorProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const poseRef = useRef<ReturnType<typeof window.Pose> | null>(null);
  const cameraRef = useRef<ReturnType<typeof window.Camera> | null>(null);
  const selectedLimbRef = useRef<LimbType>(selectedLimb);
  const isMobile = isMobileDevice();
  const [canvasSize, setCanvasSize] = useState(getInitialCanvasSize);
  const initializedRef = useRef(false);

  useEffect(() => {
    selectedLimbRef.current = selectedLimb;
  }, [selectedLimb]);

  useEffect(() => {
    if (!isMobile) return;
    const updateCanvasSize = () => {
      const width = Math.min(window.innerWidth - 32, 640);
      const height = Math.round((width * 3) / 4);
      setCanvasSize((prev) => {
        if (prev.width === width && prev.height === height) return prev;
        return { width, height };
      });
    };
    window.addEventListener('resize', updateCanvasSize);
    return () => window.removeEventListener('resize', updateCanvasSize);
  }, [isMobile]);

  const onResults = useCallback((results: PoseResults) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const canvasCtx = canvas.getContext('2d');
    if (!canvasCtx) return;

    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
    canvasCtx.drawImage(results.image as HTMLVideoElement, 0, 0, canvas.width, canvas.height);

    if (results.poseLandmarks) {
      const landmarks = results.poseLandmarks as Landmark[];
      const limbLandmarks = getLimbLandmarks(landmarks, selectedLimbRef.current);

      if (limbLandmarks) {
        const angle = calculateAngle(
          limbLandmarks.point1,
          limbLandmarks.point2,
          limbLandmarks.point3
        );
        onAngleUpdate(angle);

        window.drawConnectors(canvasCtx, results.poseLandmarks, window.POSE_CONNECTIONS, {
          color: '#00FF00',
          lineWidth: 2,
        });
        window.drawLandmarks(canvasCtx, results.poseLandmarks, {
          color: '#FF0000',
          lineWidth: 1,
          radius: 3,
        });

        window.drawLandmarks(canvasCtx, [limbLandmarks.point1, limbLandmarks.point2, limbLandmarks.point3], {
          color: '#FFD700',
          lineWidth: 2,
          radius: 6,
        });

        const w = canvas.width;
        const h = canvas.height;

        canvasCtx.strokeStyle = '#FFD700';
        canvasCtx.lineWidth = 4;
        canvasCtx.beginPath();
        canvasCtx.moveTo(limbLandmarks.point1.x * w, limbLandmarks.point1.y * h);
        canvasCtx.lineTo(limbLandmarks.point2.x * w, limbLandmarks.point2.y * h);
        canvasCtx.lineTo(limbLandmarks.point3.x * w, limbLandmarks.point3.y * h);
        canvasCtx.stroke();
      }
    }

    canvasCtx.restore();
  }, [onAngleUpdate]);

  useEffect(() => {
    if (!videoRef.current || !canvasRef.current) return;
    if (initializedRef.current) return;
    initializedRef.current = true;

    const pose = new window.Pose({
      locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
    });

    pose.setOptions({
      modelComplexity: isMobile ? 0 : 1,
      smoothLandmarks: true,
      enableSegmentation: false,
      smoothSegmentation: false,
      minDetectionConfidence: 0.4,
      minTrackingConfidence: 0.4,
      staticImageMode: false,
    });

    pose.onResults(onResults);
    poseRef.current = pose;

    const camera = new window.Camera(videoRef.current, {
      onFrame: async () => {
        if (videoRef.current && poseRef.current) {
          await poseRef.current.send({ image: videoRef.current });
        }
      },
      width: canvasSize.width,
      height: canvasSize.height,
      facingMode: 'user',
    });

    camera
      .start()
      .then(() => {
        setIsLoading(false);
      })
      .catch((err: Error) => {
        setError('Не удалось получить доступ к камере: ' + err.message);
        setIsLoading(false);
      });

    cameraRef.current = camera;

    return () => {
      initializedRef.current = false;
      if (cameraRef.current) {
        cameraRef.current.stop();
      }
      if (poseRef.current) {
        poseRef.current.close();
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const aspectPadding = `${(canvasSize.height / canvasSize.width) * 100}%`;

  return (
    <div className="flex items-center justify-center w-full" ref={containerRef}>
      <div className="relative w-full" style={{ paddingBottom: aspectPadding }}>
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900 rounded-lg z-10">
            <p className="text-white text-lg">Загрузка камеры...</p>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-red-900 rounded-lg z-10">
            <p className="text-white text-center px-4">{error}</p>
          </div>
        )}
        <video
          ref={videoRef}
          className="hidden"
          playsInline
          muted
          autoPlay
        />
        <canvas
          ref={canvasRef}
          width={canvasSize.width}
          height={canvasSize.height}
          className="absolute inset-0 w-full h-full rounded-lg shadow-2xl"
        />
      </div>
    </div>
  );
}
