import { useEffect, useRef, useState, useCallback } from 'react';
import { LimbType, Landmark } from '../types';
import { calculateAngle, getLimbLandmarks } from '../utils/angleCalculator';
import { PoseLandmarker, FilesetResolver, DrawingUtils, NormalizedLandmark } from '@mediapipe/tasks-vision';

interface PoseDetectorProps {
  selectedLimb: LimbType;
  onAngleUpdate: (angle: number) => void;
}

function isMobileDevice(): boolean {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

function isIOS(): boolean {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function getInitialCanvasSize() {
  const mobile = isMobileDevice();
  if (mobile) {
    const width = Math.min(window.innerWidth - 32, 480);
    const height = Math.round((width * 3) / 4);
    return { width, height };
  }
  return { width: 640, height: 480 };
}

const POSE_INTERVAL_MS = isIOS() ? 100 : isMobileDevice() ? 80 : 0;

export function PoseDetector({ selectedLimb, onAngleUpdate }: PoseDetectorProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const poseLandmarkerRef = useRef<PoseLandmarker | null>(null);
  const drawingUtilsRef = useRef<DrawingUtils | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const lastSendTimeRef = useRef(0);
  const selectedLimbRef = useRef<LimbType>(selectedLimb);
  const onAngleUpdateRef = useRef(onAngleUpdate);
  const activeRef = useRef(true);
  const mobile = isMobileDevice();
  const ios = isIOS();
  const [canvasSize, setCanvasSize] = useState(getInitialCanvasSize);
  const initRef = useRef(false);
  const canvasSizeRef = useRef(canvasSize);

  useEffect(() => {
    canvasSizeRef.current = canvasSize;
  }, [canvasSize]);

  useEffect(() => {
    selectedLimbRef.current = selectedLimb;
  }, [selectedLimb]);

  useEffect(() => {
    onAngleUpdateRef.current = onAngleUpdate;
  }, [onAngleUpdate]);

  useEffect(() => {
    if (!mobile) return;
    const updateCanvasSize = () => {
      const width = Math.min(window.innerWidth - 32, 480);
      const height = Math.round((width * 3) / 4);
      setCanvasSize((prev) => {
        if (prev.width === width && prev.height === height) return prev;
        return { width, height };
      });
    };
    window.addEventListener('resize', updateCanvasSize);
    return () => window.removeEventListener('resize', updateCanvasSize);
  }, [mobile]);

  const drawPoseOverlay = useCallback((ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, landmarks: NormalizedLandmark[]) => {
    const castLandmarks = landmarks as Landmark[];
    const limbLandmarks = getLimbLandmarks(castLandmarks, selectedLimbRef.current);
    if (!limbLandmarks) return;

    const angle = calculateAngle(
      limbLandmarks.point1,
      limbLandmarks.point2,
      limbLandmarks.point3
    );
    onAngleUpdateRef.current(angle);

    const w = canvas.width;
    const h = canvas.height;

    // Draw all skeleton connections using DrawingUtils
    try {
      if (drawingUtilsRef.current) {
        drawingUtilsRef.current.drawLandmarks(landmarks, {
          radius: 2,
          color: '#00FF00',
          fillColor: '#FF0000',
        });
      }
    } catch (_e) {
      // DrawingUtils unavailable, fall through to manual drawing
    }

    // Manual drawing for the three key limb points (always runs as primary visualization)
    const pt1 = { x: limbLandmarks.point1.x * w, y: limbLandmarks.point1.y * h };
    const pt2 = { x: limbLandmarks.point2.x * w, y: limbLandmarks.point2.y * h };
    const pt3 = { x: limbLandmarks.point3.x * w, y: limbLandmarks.point3.y * h };

    // Limb line
    ctx.strokeStyle = '#FFD700';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(pt1.x, pt1.y);
    ctx.lineTo(pt2.x, pt2.y);
    ctx.lineTo(pt3.x, pt3.y);
    ctx.stroke();

    // Key joint dots
    [pt1, pt2, pt3].forEach((pt, i) => {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, i === 1 ? 8 : 6, 0, Math.PI * 2);
      ctx.fillStyle = i === 1 ? '#FFD700' : '#FF6600';
      ctx.fill();
    });

    // Angle label near joint
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `bold ${Math.max(14, Math.round(w / 30))}px sans-serif`;
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 3;
    const label = `${angle}°`;
    ctx.strokeText(label, pt2.x + 12, pt2.y - 12);
    ctx.fillText(label, pt2.x + 12, pt2.y - 12);
  }, []);

  const startCamera = useCallback(async (poseLandmarker: PoseLandmarker) => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const { width, height } = canvasSizeRef.current;

    try {
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: 'user',
          width: { ideal: width, max: ios ? width : 1280 },
          height: { ideal: height, max: ios ? height : 960 },
          frameRate: ios
            ? { ideal: 15, max: 30 }
            : mobile
              ? { ideal: 24, max: 30 }
              : { ideal: 30, max: 60 },
        },
        audio: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      video.srcObject = stream;

      await new Promise<void>((resolve, reject) => {
        let settled = false;
        const timeout = setTimeout(() => {
          if (!settled) { settled = true; reject(new Error('Camera timeout')); }
        }, 15000);

        video.onloadedmetadata = () => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          video.play().then(resolve).catch((err) => {
            reject(new Error('Video play failed: ' + err.message));
          });
        };
        video.onerror = () => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          reject(new Error('Video element error'));
        };
      });

      setIsLoading(false);

      const loop = () => {
        if (!activeRef.current) return;

        if (video.readyState >= 2) {
          const ctx = canvas.getContext('2d');
          if (ctx) {
            // Mirror the video for front-facing camera
            ctx.save();
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.translate(canvas.width, 0);
            ctx.scale(-1, 1);
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            ctx.restore();

            const now = performance.now();
            const shouldSend = POSE_INTERVAL_MS === 0 || now - lastSendTimeRef.current >= POSE_INTERVAL_MS;

            if (shouldSend && poseLandmarker) {
              lastSendTimeRef.current = now;

              try {
                const result = poseLandmarker.detect(video);

                if (result.landmarks && result.landmarks.length > 0) {
                  const landmarks = result.landmarks[0];

                  // Mirror the x coordinates to match the mirrored video
                  const mirroredLandmarks: NormalizedLandmark[] = landmarks.map((lm) => ({
                    x: 1 - lm.x,
                    y: lm.y,
                    z: lm.z,
                    visibility: lm.visibility ?? 0,
                  }));

                  ctx.save();
                  drawPoseOverlay(ctx, canvas, mirroredLandmarks);
                  ctx.restore();
                }
              } catch (_e) {
                // pose detection failed for this frame, continue
              }
            }
          }
        }

        animFrameRef.current = requestAnimationFrame(loop);
      };

      animFrameRef.current = requestAnimationFrame(loop);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError('Не удалось подключить камеру: ' + message);
      setIsLoading(false);
    }
  }, [drawPoseOverlay, ios, mobile]);

  useEffect(() => {
    if (!videoRef.current || !canvasRef.current) return;
    if (initRef.current) return;
    initRef.current = true;
    activeRef.current = true;

    const initPose = async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
        );

        const poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numPoses: 1,
          minPoseDetectionConfidence: 0.5,
          minPosePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });

        poseLandmarkerRef.current = poseLandmarker;

        const canvas = canvasRef.current!;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          drawingUtilsRef.current = new DrawingUtils(ctx);
        }

        await startCamera(poseLandmarker);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError('Не удалось инициализировать распознавание: ' + message);
        setIsLoading(false);
      }
    };

    initPose();

    return () => {
      activeRef.current = false;
      initRef.current = false;

      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      if (poseLandmarkerRef.current) {
        poseLandmarkerRef.current.close();
        poseLandmarkerRef.current = null;
      }
      drawingUtilsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex items-center justify-center w-full">
      <div
        className="relative bg-gray-900 rounded-lg shadow-2xl overflow-hidden"
        style={{
          width: `${canvasSize.width}px`,
          maxWidth: '100%',
          aspectRatio: `${canvasSize.width} / ${canvasSize.height}`,
        }}
      >
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900 z-10">
            <p className="text-white text-lg">Загрузка камеры...</p>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-red-900 z-10">
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
          className="w-full h-full block"
        />
      </div>
    </div>
  );
}
