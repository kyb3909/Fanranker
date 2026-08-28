export type SkinToneKey = "porcelain" | "warm" | "golden" | "deep" | "umber"
export type HairColorKey = "plum" | "espresso" | "midnight" | "copper"
export type HairStyleKey = "short" | "bob" | "ponytail" | "twintail"
export type EyeColorKey = "rose" | "brown" | "blue" | "green"
export type EyeShapeKey = "round" | "bright" | "calm"
export type FaceStyleKey = "friendly" | "focused" | "cool"

export type AvatarAppearance = {
  skinTone: SkinToneKey
  hairColor: HairColorKey
  hairStyle: HairStyleKey
  eyeColor: EyeColorKey
  eyeShape: EyeShapeKey
  faceStyle: FaceStyleKey
}

export const DEFAULT_AVATAR_APPEARANCE: AvatarAppearance = {
  skinTone: "warm",
  hairColor: "plum",
  hairStyle: "bob",
  eyeColor: "rose",
  eyeShape: "round",
  faceStyle: "friendly",
}

export const SKIN_TONES = {
  porcelain: {
    label: "포슬린",
    color: "#f5cbb7",
    shadow: "#d99c8a",
    blush: "#e9787c",
    mouth: "#9d4050",
  },
  warm: {
    label: "웜",
    color: "#f5a688",
    shadow: "#d67a6b",
    blush: "#eb5f6a",
    mouth: "#8f1832",
  },
  golden: {
    label: "골든",
    color: "#d99062",
    shadow: "#ad654f",
    blush: "#c85d5d",
    mouth: "#782c38",
  },
  deep: {
    label: "딥",
    color: "#8d533d",
    shadow: "#67382f",
    blush: "#a95258",
    mouth: "#54222c",
  },
  umber: {
    label: "엄버",
    color: "#5b342d",
    shadow: "#3f2423",
    blush: "#85454b",
    mouth: "#35151e",
  },
} as const

export const HAIR_COLORS = {
  plum: { label: "플럼", color: "#3c253a", accent: "#67445f" },
  espresso: { label: "에스프레소", color: "#24150f", accent: "#583421" },
  midnight: { label: "미드나이트", color: "#10172c", accent: "#283b68" },
  copper: { label: "코퍼", color: "#612a19", accent: "#a6512d" },
} as const

// Keys are stable slot ids; labels describe the Colin hair combos mapped in
// scripts/avatar3d/build_colin_avatar.py (HAIR_COMBOS).
export const HAIR_STYLES: Record<HairStyleKey, { label: string }> = {
  short: { label: "슬릭" },
  bob: { label: "풀뱅" },
  ponytail: { label: "사이드" },
  twintail: { label: "내추럴" },
}

export const EYE_COLORS = {
  rose: { label: "로즈", color: "#751530" },
  brown: { label: "브라운", color: "#613b24" },
  blue: { label: "블루", color: "#376aa3" },
  green: { label: "그린", color: "#3d745c" },
} as const

export const EYE_SHAPES: Record<
  EyeShapeKey,
  { label: string; eyeHeight: number; eyeWidth: number }
> = {
  round: { label: "동그란 눈", eyeHeight: 1, eyeWidth: 1 },
  bright: { label: "큰 눈", eyeHeight: 1.14, eyeWidth: 1.08 },
  calm: { label: "차분한 눈", eyeHeight: 0.72, eyeWidth: 1.08 },
}

export const FACE_STYLES: Record<
  FaceStyleKey,
  { label: string; browTilt: number; mouthWidth: number; cheekScale: number }
> = {
  friendly: { label: "다정함", browTilt: 0, mouthWidth: 1.08, cheekScale: 1 },
  focused: { label: "집중", browTilt: 0.12, mouthWidth: 0.78, cheekScale: 0.72 },
  cool: { label: "시크", browTilt: -0.08, mouthWidth: 0.9, cheekScale: 0.55 },
}

export const APPEARANCE_MATERIAL_SLOTS = {
  skin: "CHAR_SKIN",
  skinShadow: "CHAR_SKIN_SHADOW",
  hair: "CHAR_HAIR",
  hairAccent: "CHAR_HAIR_ACCENT",
  eyeLine: "CHAR_EYE_LINE",
  iris: "CHAR_IRIS",
  eyeHighlight: "CHAR_EYE_HIGHLIGHT",
  blush: "CHAR_BLUSH",
  mouth: "CHAR_MOUTH",
} as const
