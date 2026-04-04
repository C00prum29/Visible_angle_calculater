export interface Landmark {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

export type LimbType = 'left_arm' | 'right_arm' | 'left_leg' | 'right_leg';

export interface AngleResult {
  angle: number;
  limbType: LimbType;
  landmarks: {
    point1: Landmark;
    point2: Landmark;
    point3: Landmark;
  };
}
