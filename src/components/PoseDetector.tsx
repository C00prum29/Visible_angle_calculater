import { useEffect, useRef, useState, useCallback } from 'react';
import { LimbType, Landmark } from '../types';
import { calculateAngle, getLimbLandmarks } from '../utils/angleCalculator';

declare global {
  interface Window {
    Pose: new (config: { locateFile: (file: string) => string }) => {
      setOptions: (options: Record<string, unknown>) => void;
      onResults: (callback: (results: PoseResults) => void) => void;
      send: (input: { image: HTMLVideoElement | HTMLCanvasElement }) => Promise<void>;
      close: () => void;
    };
    Camera: new (
      videoElement: HTMLVideoElement,
      config: {
        onFrame: () => Promise<void>;
        width: number;
        height: number;
        facingMode?: string;
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
  const poseRef = useRef<ReturnType<typeof window.Pose> | null>(null);
  const cameraRef = useRef<ReturnType<typeof window.Camera> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const selectedLimbRef = useRef<LimbType>(selectedLimb);
  const lastPoseResultRef = useRef<PoseResults | null>(null);
  const sendingRef = useRef(false);
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

  const drawPoseOverlay = useCallback((ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, results: PoseResults) => {
    if (!results.poseLandmarks) return;

    const landmarks = results.poseLandmarks as Landmark[];
    const limbLandmarks = getLimbLandmarks(landmarks, selectedLimbRef.current);
    if (!limbLandmarks) return;

    const angle = calculateAngle(
      limbLandmarks.point1,
      limbLandmarks.point2,
      limbLandmarks.point3
    );
    onAngleUpdate(angle);

    const scaledLandmarks = results.poseLandmarks.map((lm: Landmark) => ({
      ...lm,
      x: lm.x * canvas.width,
      y: lm.y * canvas.height,
      z: lm.z * canvas.width,
    }));

    const scaledPoint = (lm: Landmark) => ({
      x: lm.x * canvas.width,
      y: lm.y * canvas.height,
      z: lm.z * canvas.width,
    });

    window.drawConnectors(ctx, scaledLandmarks, window.POSE_CONNECTIONS, {
      color: '#00FF00',
      lineWidth: 2,
    });
    window.drawLandmarks(ctx, scaledLandmarks, {
      color: '#FF0000',
      lineWidth: 1,
      radius: 3,
    });

    window.drawLandmarks(ctx, [
      scaledPoint(limbLandmarks.point1),
      scaledPoint(limbLandmarks.point2),
      scaledPoint(limbLandmarks.point3),
    ], {
      color: '#FFD700',
      lineWidth: 2,
      radius: 6,
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

  // Desktop: onResults draws video + overlay in one pass
  const onResultsDesktop = useCallback((results: PoseResults) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (results.image) {
      ctx.drawImage(results.image as CanvasImageSource, 0, 0, canvas.width, canvas.height);
    } else {
      const video = videoRef.current;
      if (video && video.readyState >= 2) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      }
    }

    drawPoseOverlay(ctx, canvas, results);
    ctx.restore();
  }, [drawPoseOverlay]);

  // Mobile: onResults just stores the result, drawing happens in rAF loop
  const onResultsMobile = useCallback((results: PoseResults) => {
    lastPoseResultRef.current = results;
    sendingRef.current = false;
  }, []);

  // Mobile path: getUserMedia + rAF loop with throttled pose.send
  const startMobileCamera = useCallback(async (pose: ReturnType<typeof window.Pose>) => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    try {
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: 'user',
          width: { ideal: canvasSize.width },
          height: { ideal: canvasSize.height },
        },
        audio: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      if (!mountedRef.current) {
        stream.getTracks().forEach(t => t.stop());
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

      if (!mountedRef.current) return;

      setIsLoading(false);

      const loop = () => {
        if (!mountedRef.current || !streamRef.current) return;

        if (video.readyState >= 2) {
          const ctx = canvas.getContext('2d');
          if (ctx) {
            // Draw video every frame
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

            // Draw pose overlay from last available result
            const lastResult = lastPoseResultRef.current;
            if (lastResult) {
              ctx.save();
              drawPoseOverlay(ctx, canvas, lastResult);
              ctx.restore();
            }
          }

          // Send frame to MediaPipe only if previous send completed
          if (!sendingRef.current) {
            sendingRef.current = true;
            pose.send({ image: video }).catch(() => {
              sendingRef.current = false;
            });
          }
        }

        animFrameRef.current = requestAnimationFrame(loop);
      };

      animFrameRef.current = requestAnimationFrame(loop);
    } catch (err) {
      if (!mountedRef.current) return;
      const message = err instanceof Error ? err.message : String(err);
      setError('Не удалось подключить камеру: ' + message);
      setIsLoading(false);
    }
  }, [canvasSize, drawPoseOverlay]);

  useEffect(() => {
    mountedRef.current = true;

    if (!videoRef.current || !canvasRef.current) return;
    if (initRef.current) return;
    initRef.current = true;

    const initPose = async () => {
      try {
        const pose = new window.Pose({
          locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
        });

        pose.setOptions({
          modelComplexity: mobile ? 0 : 1,
          smoothLandmarks: true,
          enableSegmentation: false,
          smoothSegmentation: false,
          minDetectionConfidence: 0.4,
          minTrackingConfidence: 0.4,
          staticImageMode: false,
        });

        if (mobile) {
          pose.onResults(onResultsMobile);
        } else {
          pose.onResults(onResultsDesktop);
        }
        poseRef.current = pose;

        if (mobile) {
          await startMobileCamera(pose);
        } else {
          const video = videoRef.current!;
          const camera = new window.Camera(video, {
            onFrame: async () => {
              if (poseRef.current && video.videoWidth > 0) {
                await poseRef.current.send({ image: video });
              }
            },
            width: canvasSize.width,
            height: canvasSize.height,
            facingMode: 'user',
          });
          await camera.start();
          cameraRef.current = camera;
          setIsLoading(false);
        }
      } catch (err) {
        if (!mountedRef.current) return;
        const message = err instanceof Error ? err.message : String(err);
        setError('Не удалось получить доступ к камере: ' + message);
        setIsLoading(false);
      }
    };

    initPose();

    return () => {
      mountedRef.current = false;

      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }

      if (cameraRef.current) {
        try { cameraRef.current.stop(); } catch (_) { /* ignore */ }
        cameraRef.current = null;
      }

      if (poseRef.current) {
        try { poseRef.current.close(); } catch (_) { /* ignore */ }
        poseRef.current = null;
      }

      // Clear video element to release camera
      if (videoRef.current) {
        videoRef.current.onloadedmetadata = null;
        videoRef.current.onerror = null;
        videoRef.current.srcObject = null;
        videoRef.current.load();
      }

      sendingRef.current = false;
      lastPoseResultRef.current = null;
      initRef.current = false;
    };
  }, [canvasSize, onResultsDesktop, onResultsMobile, mobile, startMobileCamera]);

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
