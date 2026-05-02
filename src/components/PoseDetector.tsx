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

export function PoseDetector({ selectedLimb, onAngleUpdate }: PoseDetectorProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const poseRef = useRef<ReturnType<typeof window.Pose> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const selectedLimbRef = useRef<LimbType>(selectedLimb);
  const onAngleUpdateRef = useRef(onAngleUpdate);

  useEffect(() => {
    selectedLimbRef.current = selectedLimb;
  }, [selectedLimb]);

  useEffect(() => {
    onAngleUpdateRef.current = onAngleUpdate;
  }, [onAngleUpdate]);

  useEffect(() => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;

    const pose = new window.Pose({
      locateFile: (file: string) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`;
      },
    });

    pose.setOptions({
      modelComplexity: 1,
      smoothLandmarks: true,
      enableSegmentation: false,
      smoothSegmentation: false,
      minDetectionConfidence: 0.4,
      minTrackingConfidence: 0.4,
    });

    pose.onResults(onResults);
    poseRef.current = pose;

    const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

    navigator.mediaDevices
      .getUserMedia({
        video: {
          facingMode: isMobile ? 'user' : 'environment',
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
        audio: false,
      })
      .then((stream) => {
        streamRef.current = stream;
        video.srcObject = stream;
        video.onloadedmetadata = () => {
          video.play();
          setIsLoading(false);
          startLoop();
        };
      })
      .catch((err: Error) => {
        setError('Не удалось получить доступ к камере: ' + err.message);
        setIsLoading(false);
      });

    function startLoop() {
      const loop = async () => {
        if (video.readyState >= 2 && poseRef.current) {
          await poseRef.current.send({ image: video });
        }
        animFrameRef.current = requestAnimationFrame(loop);
      };
      animFrameRef.current = requestAnimationFrame(loop);
    }

    return () => {
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current);
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (poseRef.current) {
        poseRef.current.close();
      }
    };
  }, []);

  function onResults(results: PoseResults) {
    if (!canvasRef.current) return;

    const canvasCtx = canvasRef.current.getContext('2d');
    if (!canvasCtx) return;

    const { width, height } = canvasRef.current;

    canvasCtx.save();
    canvasCtx.clearRect(0, 0, width, height);

    // Mirror the canvas horizontally so the user sees a selfie-style view
    canvasCtx.translate(width, 0);
    canvasCtx.scale(-1, 1);
    canvasCtx.drawImage(results.image as HTMLVideoElement, 0, 0, width, height);
    canvasCtx.restore();

    if (results.poseLandmarks) {
      const landmarks = results.poseLandmarks as Landmark[];

      // Mirror landmarks for correct overlay on the flipped canvas
      const mirroredLandmarks = landmarks.map((lm) => ({ ...lm, x: 1 - lm.x }));

      const limbLandmarks = getLimbLandmarks(mirroredLandmarks, selectedLimbRef.current);

      if (limbLandmarks) {
        const angle = calculateAngle(
          limbLandmarks.point1,
          limbLandmarks.point2,
          limbLandmarks.point3
        );
        onAngleUpdateRef.current(angle);

        window.drawConnectors(canvasCtx, mirroredLandmarks, window.POSE_CONNECTIONS, {
          color: '#00FF00',
          lineWidth: 2,
        });
        window.drawLandmarks(canvasCtx, mirroredLandmarks, {
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

        canvasCtx.strokeStyle = '#FFD700';
        canvasCtx.lineWidth = 4;
        canvasCtx.beginPath();
        canvasCtx.moveTo(limbLandmarks.point1.x * width, limbLandmarks.point1.y * height);
        canvasCtx.lineTo(limbLandmarks.point2.x * width, limbLandmarks.point2.y * height);
        canvasCtx.lineTo(limbLandmarks.point3.x * width, limbLandmarks.point3.y * height);
        canvasCtx.stroke();
      }
    }
  }

  return (
    <div className="flex items-center justify-center w-full">
      <div className="relative w-full">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900 rounded-lg z-10 min-h-[240px]">
            <p className="text-white text-lg">Загрузка камеры...</p>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-red-900 rounded-lg z-10 min-h-[240px]">
            <p className="text-white text-center px-4">{error}</p>
          </div>
        )}
        <video
          ref={videoRef}
          className="hidden"
          playsInline
          muted
        />
        <canvas
          ref={canvasRef}
          width={640}
          height={480}
          className="rounded-lg shadow-2xl w-full h-auto"
        />
      </div>
    </div>
  );
}
