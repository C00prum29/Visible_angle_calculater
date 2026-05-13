import { useEffect, useRef, useState, useCallback } from 'react';
import { FilesetResolver, PoseLandmarker, DrawingUtils } from '@mediapipe/tasks-vision';
import { LimbType, Landmark } from '../types';
import { calculateAngle, getLimbLandmarks } from '../utils/angleCalculator';

interface PoseDetectorProps {
  selectedLimb: LimbType;
  onAngleUpdate: (angle: number) => void;
}

function isMobileDevice(): boolean {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

function getInitialCanvasSize() {
  const mobile = isMobileDevice();
  if (mobile) {
    const width = Math.min(window.innerWidth - 32, 640);
    const height = Math.round((width * 3) / 4);
    return { width, height };
  }
  return { width: 640, height: 480 };
}

export function PoseDetector({ selectedLimb, onAngleUpdate }: PoseDetectorProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const poseLandmarkerRef = useRef<PoseLandmarker | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const selectedLimbRef = useRef<LimbType>(selectedLimb);
  const lastVideoTimeRef = useRef(-1);
  const mountedRef = useRef(true);
  const mobile = isMobileDevice();
  const [canvasSize, setCanvasSize] = useState(getInitialCanvasSize);
  const initRef = useRef(false);

  useEffect(() => {
    selectedLimbRef.current = selectedLimb;
  }, [selectedLimb]);

  useEffect(() => {
    if (!mobile) return;
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
  }, [mobile]);

  const drawPoseOverlay = useCallback((ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, landmarks: Landmark[]) => {
    const limbLandmarks = getLimbLandmarks(landmarks, selectedLimbRef.current);
    if (!limbLandmarks) return;

    const angle = calculateAngle(
      limbLandmarks.point1,
      limbLandmarks.point2,
      limbLandmarks.point3
    );
    onAngleUpdate(angle);

    const drawingUtils = new DrawingUtils(ctx);

    drawingUtils.drawConnectors(landmarks, PoseLandmarker.POSE_CONNECTIONS, {
      color: '#00FF00',
      lineWidth: 2,
    });
    drawingUtils.drawLandmarks(landmarks, {
      radius: 3,
      color: '#FF0000',
      fillColor: '#FF0000',
    });

    const scaledPoint = (lm: Landmark) => ({
      x: lm.x * canvas.width,
      y: lm.y * canvas.height,
      z: lm.z * canvas.width,
    });

    drawingUtils.drawLandmarks([
      scaledPoint(limbLandmarks.point1),
      scaledPoint(limbLandmarks.point2),
      scaledPoint(limbLandmarks.point3),
    ], {
      radius: 6,
      color: '#FFD700',
      fillColor: '#FFD700',
    });

    const w = canvas.width;
    const h = canvas.height;

    ctx.strokeStyle = '#FFD700';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(limbLandmarks.point1.x * w, limbLandmarks.point1.y * h);
    ctx.lineTo(limbLandmarks.point2.x * w, limbLandmarks.point2.y * h);
    ctx.lineTo(limbLandmarks.point3.x * w, limbLandmarks.point3.y * h);
    ctx.stroke();
  }, [onAngleUpdate]);

  useEffect(() => {
    mountedRef.current = true;

    if (!videoRef.current || !canvasRef.current) return;
    if (initRef.current) return;
    initRef.current = true;

    let cancelled = false;

    const init = async () => {
      try {
        // 1. Load MediaPipe Vision WASM
        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
        );

        if (cancelled || !mountedRef.current) return;

        // 2. Create PoseLandmarker
        const poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numPoses: 1,
          minPoseDetectionConfidence: 0.4,
          minPosePresenceConfidence: 0.4,
          minTrackingConfidence: 0.4,
        });

        if (cancelled || !mountedRef.current) {
          poseLandmarker.close();
          return;
        }

        poseLandmarkerRef.current = poseLandmarker;

        // 3. Start camera via getUserMedia
        const video = videoRef.current!;
        const canvas = canvasRef.current!;

        const constraints: MediaStreamConstraints = {
          video: {
            facingMode: 'user',
            width: { ideal: canvasSize.width },
            height: { ideal: canvasSize.height },
          },
          audio: false,
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);

        if (cancelled || !mountedRef.current) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        video.srcObject = stream;

        await new Promise<void>((resolve, reject) => {
          let settled = false;
          const timeout = setTimeout(() => {
            if (!settled) {
              settled = true;
              reject(new Error('Camera timeout'));
            }
          }, 15000);

          video.onloadedmetadata = () => {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            video.play().then(resolve).catch(reject);
          };
          video.onerror = () => {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            reject(new Error('Video error'));
          };
        });

        if (cancelled || !mountedRef.current) return;

        setIsLoading(false);

        // 4. Detection loop
        const detect = () => {
          if (!mountedRef.current || !streamRef.current) return;

          if (video.readyState >= 2) {
            const ctx = canvas.getContext('2d');
            if (ctx) {
              // Draw video frame
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

              // Detect pose
              try {
                const now = performance.now();
                // Only send if video has advanced
                if (video.currentTime !== lastVideoTimeRef.current) {
                  lastVideoTimeRef.current = video.currentTime;
                  const result = poseLandmarker.detectForVideo(video, now);

                  if (result.landmarks && result.landmarks.length > 0) {
                    const landmarks = result.landmarks[0] as Landmark[];
                    drawPoseOverlay(ctx, canvas, landmarks);
                  }
                }
              } catch (e) {
                // Silently skip frame on detection error
                console.warn('Pose detection error:', e);
              }
            }
          }

          animFrameRef.current = requestAnimationFrame(detect);
        };

        animFrameRef.current = requestAnimationFrame(detect);
      } catch (err) {
        if (cancelled || !mountedRef.current) return;
        const message = err instanceof Error ? err.message : String(err);
        setError('Не удалось подключить камеру: ' + message);
        setIsLoading(false);
      }
    };

    init();

    return () => {
      cancelled = true;
      mountedRef.current = false;

      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }

      if (poseLandmarkerRef.current) {
        try {
          poseLandmarkerRef.current.close();
        } catch (_) { /* ignore */ }
        poseLandmarkerRef.current = null;
      }

      if (videoRef.current) {
        videoRef.current.onloadedmetadata = null;
        videoRef.current.onerror = null;
        videoRef.current.srcObject = null;
        videoRef.current.load();
      }

      lastVideoTimeRef.current = -1;
      initRef.current = false;
    };
  }, [canvasSize, drawPoseOverlay]);

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
