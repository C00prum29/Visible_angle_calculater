import { useEffect, useRef, useState } from 'react';
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

export function PoseDetector({ selectedLimb, onAngleUpdate }: PoseDetectorProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const poseRef = useRef<ReturnType<typeof window.Pose> | null>(null);
  const cameraRef = useRef<ReturnType<typeof window.Camera> | null>(null);
  const selectedLimbRef = useRef<LimbType>(selectedLimb);
  const isMobile = isMobileDevice();
  const [canvasSize, setCanvasSize] = useState({ width: 640, height: 480 });

  useEffect(() => {
    selectedLimbRef.current = selectedLimb;
  }, [selectedLimb]);

  useEffect(() => {
    if (isMobile) {
      const updateCanvasSize = () => {
        const width = Math.min(window.innerWidth - 32, 640);
        const height = (width * 3) / 4;
        setCanvasSize({ width, height });
      };
      updateCanvasSize();
      window.addEventListener('resize', updateCanvasSize);
      return () => window.removeEventListener('resize', updateCanvasSize);
    }
  }, [isMobile]);

  useEffect(() => {
    if (!videoRef.current || !canvasRef.current) return;

    const pose = new window.Pose({
      locateFile: (file: string) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`;
      },
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
      if (cameraRef.current) {
        cameraRef.current.stop();
      }
      if (poseRef.current) {
        poseRef.current.close();
      }
    };
  }, [canvasSize]);

  function onResults(results: PoseResults) {
    if (!canvasRef.current) return;

    const canvasCtx = canvasRef.current.getContext('2d');
    if (!canvasCtx) return;

    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    canvasCtx.drawImage(results.image as HTMLVideoElement, 0, 0, canvasRef.current.width, canvasRef.current.height);

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

        const highlightPoints = [
          limbLandmarks.point1,
          limbLandmarks.point2,
          limbLandmarks.point3,
        ];
        window.drawLandmarks(canvasCtx, highlightPoints, {
          color: '#FFD700',
          lineWidth: 2,
          radius: 6,
        });

        const width = canvasRef.current.width;
        const height = canvasRef.current.height;

        canvasCtx.strokeStyle = '#FFD700';
        canvasCtx.lineWidth = 4;
        canvasCtx.beginPath();
        canvasCtx.moveTo(limbLandmarks.point1.x * width, limbLandmarks.point1.y * height);
        canvasCtx.lineTo(limbLandmarks.point2.x * width, limbLandmarks.point2.y * height);
        canvasCtx.lineTo(limbLandmarks.point3.x * width, limbLandmarks.point3.y * height);
        canvasCtx.stroke();
      }
    }

    canvasCtx.restore();
  }

  return (
    <div className="flex items-center justify-center w-full">
      <div className="relative">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900 rounded-lg">
            <p className="text-white text-lg">Загрузка камеры...</p>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-red-900 rounded-lg">
            <p className="text-white text-center px-4">{error}</p>
          </div>
        )}
        <video
          ref={videoRef}
          className="hidden"
          playsInline
        />
        <canvas
          ref={canvasRef}
          width={canvasSize.width}
          height={canvasSize.height}
          className="rounded-lg shadow-2xl w-full h-auto"
        />
      </div>
    </div>
  );
}
