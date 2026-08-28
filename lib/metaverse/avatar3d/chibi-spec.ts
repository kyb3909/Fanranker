// Kept for the code-generated debug fallback. The production GLB uses Blender/glTF units.
export const CHIBI_SCALE_METERS_PER_UNIT = 0.03

export const CHIBI_SPEC = {
  totalHeight: 3.3,
  headHeight: 1.22,
  headRatio: 2.7,
  pivots: {
    pelvis: [0, 0, 1.27],
    torso: [0, 0, 1.31],
    head: [0, 0, 1.97],
    shoulderLeft: [-0.46, 0, 1.89],
    shoulderRight: [0.46, 0, 1.89],
    elbowLeft: [-0.535, 0, 1.43],
    elbowRight: [0.535, 0, 1.43],
    hipLeft: [-0.19, 0, 1.2],
    hipRight: [0.19, 0, 1.2],
    kneeLeft: [-0.2, 0, 0.66],
    kneeRight: [0.2, 0, 0.66],
    ankleLeft: [-0.205, -0.04, 0.25],
    ankleRight: [0.205, -0.04, 0.25],
  },
} as const

export type ChibiCameraView = "front" | "three-quarter" | "side"
