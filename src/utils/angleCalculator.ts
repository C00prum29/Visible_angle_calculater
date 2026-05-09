import { Landmark, LimbType } from '../types';

export function calculateAngle(
  point1: Landmark,
  point2: Landmark,
  point3: Landmark
): number {
  const radians =
    Math.atan2(point3.y - point2.y, point3.x - point2.x) -
    Math.atan2(point1.y - point2.y, point1.x - point2.x);

  let angle = Math.abs((radians * 180.0) / Math.PI);

  if (angle > 180.0) {
    angle = 360.0 - angle;
  }

  return Math.round(angle * 10) / 10;
}

function isLandmarkVisible(landmark: Landmark): boolean {
  return landmark.visibility !== undefined ? landmark.visibility > 0.3 : true;
}

export function getLimbLandmarks(
  landmarks: Landmark[],
  limbType: LimbType
): { point1: Landmark; point2: Landmark; point3: Landmark } | null {
  if (!landmarks || landmarks.length < 33) {
    return null;
  }

  let point1: Landmark | null = null;
  let point2: Landmark | null = null;
  let point3: Landmark | null = null;

  switch (limbType) {
    case 'left_arm':
      point1 = landmarks[11];
      point2 = landmarks[13];
      point3 = landmarks[15];
      break;
    case 'right_arm':
      point1 = landmarks[12];
      point2 = landmarks[14];
      point3 = landmarks[16];
      break;
    case 'left_leg':
      point1 = landmarks[23];
      point2 = landmarks[25];
      point3 = landmarks[27];
      break;
    case 'right_leg':
      point1 = landmarks[24];
      point2 = landmarks[26];
      point3 = landmarks[28];
      break;
    default:
      return null;
  }

  if (point1 && point2 && point3 && isLandmarkVisible(point1) && isLandmarkVisible(point2) && isLandmarkVisible(point3)) {
    return { point1, point2, point3 };
  }

  return null;
}
