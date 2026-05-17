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

// FIX 1: Increased interval for iOS — MediaPipe on iOS needs more time between sends.
// 200ms was too aggressive; 350ms gives the WASM runtime breathing room.
const MOBILE_POSE_INTERVAL_MS = 350;

// FIX 2: Reduced send timeout — 3000ms was too long; if pose.send() hangs on iOS,
// 1500ms is enough to detect the stall and reset the processing flag.
const SEND_TIMEOUT_MS = 1500;

export function PoseDetector({ selectedLimb, onAngleUpdate }: PoseDetectorProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const poseRef = useRef<ReturnType<typeof window.Pose> | null>(null);
  const cameraRef = useRef<ReturnType<typeof window.Camera> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const processingRef = useRef(false);
  const lastSendTimeRef = useRef(0);
  const sendTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectedLimbRef = useRef<LimbType>(selectedLimb);
  const onAngleUpdateRef = useRef(onAngleUpdate);
  const lastPoseResultRef = useRef<PoseResults | null>(null);
  const activeRef = useRef(true);
  const mobile = isMobileDevice();
  const ios = isIOS();
  const [canvasSize, setCanvasSize] = useState(getInitialCanvasSize);
  const initRef = useRef(false);
  // FIX 3: Track canvas size in a ref so startMobileCamera doesn't need
  // canvasSize as a dep (preventing useCallback recreation on resize).
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

  // FIX 4: drawPoseOverlay now draws limb lines manually instead of relying on
  // window.drawConnectors/window.drawLandmarks for the highlighted points.
  // On iOS, those MediaPipe drawing utils sometimes fail silently when called
  // from a rAF loop that's separate from the pose.send() callback.
  const drawPoseOverlay = useCallback((ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, landmarks: Landmark[]) => {
    const limbLandmarks = getLimbLandmarks(landmarks, selectedLimbRef.current);
    if (!limbLandmarks) return;

    const angle = calculateAngle(
      limbLandmarks.point1,
      limbLandmarks.point2,
      limbLandmarks.point3
    );
    onAngleUpdateRef.current(angle);

    const w = canvas.width;
    const h = canvas.height;

    const scaledLandmarks = landmarks.map((lm: Landmark) => ({
      ...lm,
      x: lm.x * w,
      y: lm.y * h,
      z: lm.z * w,
    }));

    // FIX 5: Wrap MediaPipe drawing helpers in try/catch.
    // On iOS they can throw if the CDN scripts haven't fully initialised yet.
    try {
      if (typeof window.drawConnectors === 'function' && window.POSE_CONNECTIONS) {
        window.drawConnectors(ctx, scaledLandmarks, window.POSE_CONNECTIONS, {
          color: '#00FF00',
          lineWidth: 2,
        });
      }
      if (typeof window.drawLandmarks === 'function') {
        window.drawLandmarks(ctx, scaledLandmarks, {
          color: '#FF0000',
          lineWidth: 1,
          radius: 3,
        });
      }
    } catch (_e) {
      // Drawing helpers unavailable — fall through to manual drawing below
    }

    // Manual fallback drawing for the three key limb points (always runs,
    // gives visible feedback even when MediaPipe drawing utils fail).
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

  // Desktop: MediaPipe Camera drives the loop
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

    if (results.poseLandmarks) {
      drawPoseOverlay(ctx, canvas, results.poseLandmarks as Landmark[]);
    }
    ctx.restore();
  }, [drawPoseOverlay]);

  // Mobile/iOS: store latest pose result; rAF loop applies it
  const onResultsMobile = useCallback((results: PoseResults) => {
    if (results.poseLandmarks && results.poseLandmarks.length > 0) {
      lastPoseResultRef.current = results;
    }
    processingRef.current = false;
    if (sendTimeoutRef.current !== null) {
      clearTimeout(sendTimeoutRef.current);
      sendTimeoutRef.current = null;
    }
  }, []);

  // FIX 6: startMobileCamera no longer depends on `canvasSize` (uses ref instead),
  // so the function reference is stable and won't retrigger the main useEffect.
  const startMobileCamera = useCallback(async (pose: ReturnType<typeof window.Pose>) => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const { width, height } = canvasSizeRef.current;

    try {
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: 'user',
          width: { ideal: width, max: width },
          height: { ideal: height, max: height },
          // FIX 7: Reduced max frameRate on iOS — high frame rates cause the
          // GPU/CPU to throttle, which stalls the WKWebView JS thread and
          // triggers the freeze. 15fps is stable.
          frameRate: { ideal: 10, max: 15 },
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
          // FIX 8: On iOS, play() must be called from a user gesture context or
          // it silently fails. Using .catch() here surfaces errors.
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
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

            const lastResult = lastPoseResultRef.current;
            if (lastResult?.poseLandmarks && lastResult.poseLandmarks.length > 0) {
              ctx.save();
              drawPoseOverlay(ctx, canvas, lastResult.poseLandmarks as Landmark[]);
              ctx.restore();
            }
          }

          const now = performance.now();
          if (!processingRef.current && now - lastSendTimeRef.current >= MOBILE_POSE_INTERVAL_MS) {
            processingRef.current = true;
            lastSendTimeRef.current = now;

            // FIX 9: SEND_TIMEOUT_MS is now 1500ms (was 3000ms).
            // On iOS, if pose.send() stalls (JS thread suspended by browser),
            // the old 3s timeout meant the UI would freeze for 3 full seconds
            // before recovering — now it recovers in 1.5s.
            sendTimeoutRef.current = setTimeout(() => {
              processingRef.current = false;
              sendTimeoutRef.current = null;
            }, SEND_TIMEOUT_MS);

            // FIX 10: Wrap pose.send in try/catch AND handle the promise rejection.
            // On iOS, pose.send() can throw synchronously if the WASM runtime
            // is not ready, which would leave processingRef stuck at true.
            try {
              pose.send({ image: video }).catch(() => {
                processingRef.current = false;
                if (sendTimeoutRef.current !== null) {
                  clearTimeout(sendTimeoutRef.current);
                  sendTimeoutRef.current = null;
                }
              });
            } catch {
              processingRef.current = false;
              if (sendTimeoutRef.current !== null) {
                clearTimeout(sendTimeoutRef.current);
                sendTimeoutRef.current = null;
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
  }, [drawPoseOverlay]); // FIX 6: removed canvasSize from deps

  useEffect(() => {
    if (!videoRef.current || !canvasRef.current) return;
    if (initRef.current) return;
    initRef.current = true;
    activeRef.current = true;

    const initPose = async () => {
      try {
        const pose = new window.Pose({
          locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
        });

        pose.setOptions({
          modelComplexity: 0,
          smoothLandmarks: true,
          enableSegmentation: false,
          smoothSegmentation: false,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5,
          staticImageMode: false,
        });

        if (ios || mobile) {
          pose.onResults(onResultsMobile);
          poseRef.current = pose;
          await startMobileCamera(pose);
        } else {
          pose.onResults(onResultsDesktop);
          poseRef.current = pose;
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
        const message = err instanceof Error ? err.message : String(err);
        setError('Не удалось получить доступ к камере: ' + message);
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
      if (sendTimeoutRef.current !== null) {
        clearTimeout(sendTimeoutRef.current);
        sendTimeoutRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      if (cameraRef.current) {
        cameraRef.current.stop();
        cameraRef.current = null;
      }
      if (poseRef.current) {
        poseRef.current.close();
        poseRef.current = null;
      }
    };
    // FIX 11: Stable dependency list — startMobileCamera is now stable (see FIX 6),
    // so this effect only runs once on mount and cleans up on unmount.
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
