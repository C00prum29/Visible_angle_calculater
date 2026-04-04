import { useEffect, useRef, useState } from 'react';
import { Pose, Results } from '@mediapipe/pose';
import { Camera } from '@mediapipe/camera_utils';
import { drawConnectors, drawLandmarks } from '@mediapipe/drawing_utils';
import { POSE_CONNECTIONS } from '@mediapipe/pose';
import { LimbType, Landmark } from '../types';
import { calculateAngle, getLimbLandmarks } from '../utils/angleCalculator';

interface PoseDetectorProps {
  selectedLimb: LimbType;
  onAngleUpdate: (angle: number) => void;
}

export function PoseDetector({ selectedLimb, onAngleUpdate }: PoseDetectorProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const poseRef = useRef<Pose | null>(null);
  const cameraRef = useRef<Camera | null>(null);
  const selectedLimbRef = useRef<LimbType>(selectedLimb);

  useEffect(() => {
    selectedLimbRef.current = selectedLimb;
  }, [selectedLimb]);

  useEffect(() => {
    if (!videoRef.current || !canvasRef.current) return;

    const pose = new Pose({
      locateFile: (file) => {
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

    const camera = new Camera(videoRef.current, {
      onFrame: async () => {
        if (videoRef.current && poseRef.current) {
          await poseRef.current.send({ image: videoRef.current });
        }
      },
      width: 640,
      height: 480,
    });

    camera
      .start()
      .then(() => {
        setIsLoading(false);
      })
      .catch((err) => {
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
  }, []);

  function onResults(results: Results) {
    if (!canvasRef.current) return;

    const canvasCtx = canvasRef.current.getContext('2d');
    if (!canvasCtx) return;

    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    canvasCtx.drawImage(results.image, 0, 0, canvasRef.current.width, canvasRef.current.height);

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

        drawConnectors(canvasCtx, results.poseLandmarks, POSE_CONNECTIONS, {
          color: '#00FF00',
          lineWidth: 2,
        });
        drawLandmarks(canvasCtx, results.poseLandmarks, {
          color: '#FF0000',
          lineWidth: 1,
          radius: 3,
        });

        const highlightPoints = [
          limbLandmarks.point1,
          limbLandmarks.point2,
          limbLandmarks.point3,
        ];
        drawLandmarks(canvasCtx, highlightPoints, {
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
        width={640}
        height={480}
        className="rounded-lg shadow-2xl"
      />
    </div>
  );
}
