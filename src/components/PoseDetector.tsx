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
  const displayCanvasRef = useRef<HTMLCanvasElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const poseRef = useRef<ReturnType<typeof window.Pose> | null>(null);
  const cameraRef = useRef<ReturnType<typeof window.Camera> | null>(null);
  const selectedLimbRef = useRef<LimbType>(selectedLimb);
  const isMobile = isMobileDevice();
  const [canvasSize, setCanvasSize] = useState({ width: 640, height: 480 });
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    selectedLimbRef.current = selectedLimb;
  }, [selectedLimb]);

  useEffect(() => {
    const updateCanvasSize = () => {
      const width = Math.min(window.innerWidth - 32, isMobile ? 480 : 640);
      const height = (width * 3) / 4;
      setCanvasSize({ width, height });
    };
    updateCanvasSize();
    window.addEventListener('resize', updateCanvasSize);
    return () => window.removeEventListener('resize', updateCanvasSize);
  }, [isMobile]);

  useEffect(() => {
    if (!videoRef.current || !canvasRef.current) return;

    const initCamera = async () => {
      try {
        const constraints = {
          video: {
            facingMode: 'user',
            width: { ideal: canvasSize.width },
            height: { ideal: canvasSize.height },
          },
          audio: false,
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }

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
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5,
          staticImageMode: false,
        });

        pose.onResults(onResults);
        poseRef.current = pose;

        const processFrame = async () => {
          if (videoRef.current && videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
            await pose.send({ image: videoRef.current });
          }
          if (streamRef.current) {
            requestAnimationFrame(processFrame);
          }
        };

        videoRef.current?.addEventListener('loadedmetadata', () => {
          setIsLoading(false);
          processFrame();
        });

        const timeout = setTimeout(() => {
          if (isLoading) {
            setIsLoading(false);
          }
        }, 2000);

        return () => clearTimeout(timeout);
      } catch (err) {
        setError('Не удалось получить доступ к камере: ' + (err instanceof Error ? err.message : 'неизвестная ошибка'));
        setIsLoading(false);
      }
    };

    initCamera();

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (poseRef.current) {
        poseRef.current.close();
      }
    };
  }, [canvasSize]);

  function onResults(results: PoseResults) {
    if (!displayCanvasRef.current) return;

    const canvas = displayCanvasRef.current;
    const canvasCtx = canvas.getContext('2d');
    if (!canvasCtx) return;

    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvas.width, canvas.height);

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

        const width = canvas.width;
        const height = canvas.height;

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
      <div className="relative w-full" style={{ aspectRatio: '4/3' }}>
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900 rounded-lg z-20">
            <p className="text-white text-lg">Загрузка камеры...</p>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-red-900 rounded-lg z-20">
            <p className="text-white text-center px-4">{error}</p>
          </div>
        )}
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full rounded-lg object-cover"
          playsInline
          muted
          autoPlay
        />
        <canvas
          ref={canvasRef}
          width={canvasSize.width}
          height={canvasSize.height}
          className="absolute inset-0 w-full h-full rounded-lg"
        />
        <canvas
          ref={displayCanvasRef}
          width={canvasSize.width}
          height={canvasSize.height}
          className="absolute inset-0 w-full h-full rounded-lg shadow-2xl"
        />
      </div>
    </div>
  );
}
