# Avatar Generator — 멀티 서브 에이전트 시스템

메타버스 사이드뷰 아바타 스프라이트를 **파트별 전문 에이전트**로 배치 생성한다.
각 서브 에이전트는 자기 파트(베이스 rig / 헤어 / 상의 / 하의 / 눈 / 입)를
**8프레임 애니메이션 단위**로 생성. GPT 이미지 모델 (`gpt-image-1`) 사용.

**핵심 전략**: 하나의 거대 에이전트가 아니라, **파트마다 전문 지식을 담은
서브 에이전트 6개** — 프롬프트·검증·튜닝을 파트별로 독립 관리.

---

## 목차

1. [아키텍처 개요](#1-아키텍처-개요)
2. [폴더 구조](#2-폴더-구조)
3. [공통 기반 `_shared/`](#3-공통-기반-_shared)
4. [서브 에이전트 6개 상세](#4-서브-에이전트-6개-상세)
5. [Phase 로드맵](#5-phase-로드맵)
6. [실행 · 검증 · 배포](#6-실행-검증-배포)
7. [DB 스키마](#7-db-스키마)
8. [기존 코드 연결](#8-기존-코드-연결)
9. [예상 비용 · 일정](#9-예상-비용-일정)

---

## 1. 아키텍처 개요

### 설계 원칙

| 원칙 | 의미 |
|---|---|
| **전문화된 에이전트** | 파트마다 프롬프트·검증·튜닝 독립 (hair 전문, top 전문…) |
| **베이스 rig 중심** | 다른 모든 파트는 rig 이미지를 레퍼런스로 동작. rig 는 "기준" |
| **8프레임 단위 생성** | 각 에이전트는 한 번 실행 시 해당 파트의 8프레임 스프라이트 시트 1장 출력 |
| **2가지 프레임 스펙** | 몸/의상/헤어 = 동작 프레임(idle+walk+jump). 얼굴 = 표정 변형 |
| **병렬 실행 가능** | 에이전트간 의존성은 base-rig 완성 후에만. 그 뒤는 모두 병렬 |

### 데이터 흐름

```
          ┌──────────────────────┐
          │  avatar-base-rig     │   (1회 실행, 골든 확정)
          │  8프레임 rig 출력     │
          └──────────┬───────────┘
                     │ base-rig.png (레퍼런스)
     ┌───────────┬───┼───────┬───────────┬──────────┐
     ▼           ▼           ▼           ▼          ▼
┌─────────┐┌─────────┐┌─────────┐┌──────────┐┌──────────┐
│  hair   ││   top   ││ bottom  ││face-eyes ││face-mouth│  ← 병렬 실행
│  N종    ││  N종    ││  N종    ││  N종     ││  N종     │
│각 8프레임││각 8프레임││각 8프레임││각 8변형  ││각 8변형  │
└─────────┘└─────────┘└─────────┘└──────────┘└──────────┘
     │          │         │           │          │
     └──────────┴─────────┼───────────┴──────────┘
                          ▼
               public/metaverse/avatars/
                          │
                          ▼
              DB seed + LayeredAvatar 렌더
```

---

## 2. 폴더 구조

```
data/agents/
├── _shared/                          # 공용 기반
│   ├── style-guide.md                # 아트 스타일 공통 디렉티브
│   ├── frame-spec.md                 # 8프레임 인덱스 규약
│   ├── openai.ts                     # API 호출 래퍼
│   ├── validators/
│   │   ├── dimensions.ts
│   │   ├── transparency.ts
│   │   └── alignment.ts              # rig 기준 파트 정렬 검사
│   ├── image-utils.ts                # sharp 기반 crop/resize/transparency
│   └── types.ts                      # 공유 타입 (FrameSheet, PartSpec, etc.)
│
├── avatar-base-rig/                  # 1번 에이전트: 베이스 rig
│   ├── README.md
│   ├── run.ts
│   ├── config.yaml
│   └── prompts/
│       ├── system.md
│       └── generation.md
│
├── avatar-hair/                      # 2번: 헤어
│   ├── README.md
│   ├── run.ts
│   ├── config.yaml                   # 헤어스타일 N종 + 색상 팔레트
│   ├── variations.yaml               # "short-messy", "bob", "long-wavy" ...
│   └── prompts/
│       ├── system.md
│       ├── idle.md                   # Phase 1 (정적 1프레임)
│       └── animated.md               # Phase 2 (8프레임)
│
├── avatar-top/                       # 3번: 상의
│   ├── README.md
│   ├── run.ts
│   ├── config.yaml
│   ├── variations.yaml
│   └── prompts/
│       ├── system.md
│       ├── idle.md
│       └── animated.md
│
├── avatar-bottom/                    # 4번: 하의 (구조 top 과 동일)
│   └── ... 
│
├── avatar-face-eyes/                 # 5번: 눈 (표정 N개 variant)
│   ├── README.md
│   ├── run.ts
│   ├── config.yaml
│   ├── variations.yaml               # "neutral", "happy", "tired" ...
│   └── prompts/
│       ├── system.md
│       └── generation.md
│
├── avatar-face-mouth/                # 6번: 입 (구조 eyes 와 동일)
│   └── ...
│
├── output/                           # 모든 에이전트 공용 출력
│   ├── base-rig.png
│   ├── hair/                         # hair-short-messy-8frames.png ...
│   ├── top/
│   ├── bottom/
│   ├── face-eyes/
│   └── face-mouth/
│
├── dist/                             # 검수 통과 후 확정 에셋
│
├── .env.example
├── .gitignore                        # output/ + dist/ + .env
├── package.json                      # 루트 수준 deps
└── README.md                         # 이 파일
```

---

## 3. 공통 기반 `_shared/`

### 3.1 `_shared/style-guide.md`

**모든 에이전트 프롬프트의 최상단에 삽입될 공통 블록**.

```markdown
## 공통 아트 스타일 디렉티브

### 스타일
- Korean web-game pixel art (MapleStory / Mabinogi 감성)
- Crisp pixel edges, no anti-aliasing on outlines
- Soft warm palette with 2~3 tiers of shading
- Bold dark outer contour, subtle inner lines

### 뷰포인트
- Side view (profile), facing RIGHT by default
- Semi-chibi proportions (head slightly larger than realistic,
  approximately 4~5 head-tall body)

### 해상도 규칙
- Generation canvas: always 1024×1024 or 4×2 grid of 512×384
- Final sprite canvas (after downscale): 128×192 per frame
- Downsample uses nearest-neighbor (pixel-perfect)

### 배경 (CRITICAL)
- Background MUST be fully transparent (alpha channel, not white/black fill)
- NO scenery, floor, shadow, ground, sky — character only
- If model tends to add background, explicitly state: "isolate character,
  pure alpha transparent background, no environmental elements"

### 금지
- No text, no watermark, no UI elements, no logos
- No photo-realism, no 3D rendering, no oil painting style
- No multiple characters in one cell (unless sprite sheet with 1-per-cell)

### 일관성
- Same character identity across all frames (same age, same face shape,
  same outline weight, same palette undertone)
- Position of head, torso, feet must match the reference base rig anchors
```

### 3.2 `_shared/frame-spec.md`

**8프레임이 의미하는 동작 정의**. 에이전트마다 이 인덱스를 참조.

```markdown
## 프레임 스펙 — 몸/의상/헤어용 (motion sheet)

4×2 grid 로 배치. 좌→우, 위→아래 순서.

| Idx | 위치 | 포즈 | 용도 |
|-----|------|------|------|
| 0 | row0 col0 | idle (서있음, 팔 자연스러움) | default pose |
| 1 | row0 col1 | walk 단계 1 (오른발 앞, 왼팔 앞) | walk loop |
| 2 | row0 col2 | walk 단계 2 (양발 교차 중간) | walk loop |
| 3 | row0 col3 | walk 단계 3 (왼발 앞, 오른팔 앞) | walk loop |
| 4 | row1 col0 | walk 단계 4 (양발 교차 중간 — 3→1 복귀) | walk loop |
| 5 | row1 col1 | jump 상승 (무릎 굽힘, 팔 뒤로) | jump start |
| 6 | row1 col2 | jump 정점 (다리 모음, 공중) | jump apex |
| 7 | row1 col3 | jump 착지 (무릎 굽힘, 팔 앞으로) | jump land |

### 런타임 애니메이션 시퀀스
- **Idle**: frame 0 만
- **Walk right**: 1 → 2 → 3 → 4 loop (4프레임)
- **Walk left**: 위 시퀀스 flipX (런타임 미러)
- **Jump**: 5 → 6 → 7 → 0

### Pivot 규칙
모든 프레임에서 캐릭터의 **발 중심** 이 셀 하단 중앙 고정.
x 좌표 드리프트 금지 — 캐릭터가 제자리에서 포즈만 바뀌어야.

## 프레임 스펙 — 얼굴(눈·입)용 (expression variants)

얼굴은 동작이 아니라 감정 베리에이션. 8 variant × 1 frame 각각.

| Idx | 표정 | 컨텍스트 |
|-----|------|---------|
| 0 | neutral | 기본 |
| 1 | happy | 웃음 |
| 2 | surprised | 놀람 (예측 적중 등) |
| 3 | sad | 미적중 |
| 4 | angry | 부정 감정 |
| 5 | tired | 피곤 |
| 6 | confused | 의문 |
| 7 | wink | 인사/이벤트 |

각 variant 는 1024×1024 단일 이미지 (부위만). 배경 투명.
runtime 에서 `faceExpression` state 에 따라 해당 variant swap.
```

### 3.3 `_shared/openai.ts`

에이전트 공용 OpenAI 클라이언트 래퍼 (의사코드 — 사용자 구현 시 참고).

```ts
import OpenAI from "openai"
import { readFile } from "fs/promises"

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export async function generateImage(params: {
  prompt: string
  referenceImages?: string[]     // 파일 경로 배열
  size: "1024x1024" | "1024x1536" | "1536x1024"
  quality?: "low" | "medium" | "high"
  background?: "transparent" | "opaque" | "auto"
}): Promise<Buffer> {
  const files = params.referenceImages
    ? await Promise.all(params.referenceImages.map((p) => readFile(p)))
    : undefined

  const response = await client.images.generate({
    model: process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-1",
    prompt: params.prompt,
    size: params.size,
    quality: params.quality ?? "high",
    background: params.background ?? "transparent",
    image: files,                  // ⚠️ gpt-image-1 의 reference 입력
  })

  const b64 = response.data?.[0]?.b64_json
  if (!b64) throw new Error("no image returned")
  return Buffer.from(b64, "base64")
}
```

### 3.4 `_shared/validators/`

각 에이전트가 생성 결과를 자동 검증하는 함수들.

```ts
// dimensions.ts
export async function checkDimensions(buf: Buffer, expected: [number, number]) {
  const meta = await sharp(buf).metadata()
  return meta.width === expected[0] && meta.height === expected[1]
}

// transparency.ts
export async function checkTransparency(buf: Buffer) {
  // 모서리 4귀퉁이 50×50 픽셀 평균 알파 < 0.05 여야 배경 투명
  const { data } = await sharp(buf).raw().ensureAlpha().toBuffer({ resolveWithObject: true })
  // ... corner sampling logic
}

// alignment.ts (파트용)
export async function checkAlignment(partBuf: Buffer, rigBuf: Buffer, expectedZone: "head" | "torso" | "legs") {
  // rig 의 해당 zone 위치와 part 의 불투명 중심이 대략 일치하는지
  // 허용 오차 ±10px
}
```

---

## 4. 서브 에이전트 6개 상세

### 4.1 `avatar-base-rig/` — 베이스 rig 에이전트

#### 역할
모든 파트의 **기준이 되는 nude 캐릭터 rig**. 레이어링의 pivot 정의.

- 성별 중립 / 나이 중립
- 피부 + 속옷(타이트 쇼츠) 만 착용
- 대머리, 빈 얼굴 (이목구비 없음)
- 8프레임 sprite sheet 1장

#### 실행 빈도
**1회만**. 성공한 결과물을 "골든" 으로 확정 → 이후 수정 금지.

#### 성공률 · 튜닝
첫 시도에서 완벽히 나오기 어려움 — 5~15회 재생성 각오. 프롬프트 미세 튜닝 필요.
rig 가 망가지면 뒷 에이전트 전부 영향 → 여기에 시간 투자 가장 중요.

#### `config.yaml`

```yaml
name: avatar-base-rig
phase: 1                        # Phase 1: idle 1프레임 / Phase 2: 8프레임
size: "1024x1024"               # Phase 1
# size: "1536x1024"             # Phase 2 — 4×2 grid 용
output_path: "../output/base-rig.png"
max_retries: 10

# rig 앵커 (픽셀 단위, 1024×1024 canvas 기준)
anchors:
  head_top: { x: 512, y: 140 }
  head_center: { x: 512, y: 220 }
  shoulder_center: { x: 512, y: 340 }
  torso_center: { x: 512, y: 500 }
  hip_center: { x: 512, y: 640 }
  feet_center: { x: 512, y: 900 }

validators:
  transparent_background: true
  opacity_ratio: [0.15, 0.45]
```

#### `prompts/system.md`

```
You are a specialized pixel-art character sprite generator. Your only task is
to produce the BASE REFERENCE CHARACTER RIG for a paper-doll layering system.

This rig is NOT a final character. It's the skeleton that hair, clothes, and
face layers will be drawn on top of. Everything about it must be maximally
neutral and generic.

Critical rules:
- NUDE base body (modesty: skin-tone tight underwear shorts only; NO shirt)
- Fully bald head (visible scalp, no hair strands)
- Blank face (no eyes, no nose, no mouth — just smooth skin on oval head)
- Skin tone: light neutral beige (#f4d9b6 or similar)
- Body proportion: semi-chibi (4.5 heads tall)
- Symmetrical, facing RIGHT

You will be asked to generate ONE image. Always respect exact canvas size and
transparency requirements.
```

#### `prompts/generation.md` (Phase 1 — idle 단일 프레임)

```
{{STYLE_GUIDE}}

## Task: Base Rig (idle, single frame)

Generate the base reference character in a relaxed idle pose, facing right.

### Character specification
- Fully nude base body (androgynous, skin-tone)
- Skin-tone tight shorts (modesty only, no color/pattern)
- Completely bald — visible scalp, no hair
- Blank face — no eyes, no nose, no mouth. Just smooth skin on oval head.
- Arms relaxed at sides, legs straight, neutral standing.

### Canvas & layout (CRITICAL)
- Canvas: 1024×1024, fully transparent background
- Character centered horizontally at x=512
- Head top near y=140
- Feet bottom near y=900
- Total character height approximately 750px

### Anchor points (draw as faint 1px red dots — will be removed in post)
- Head center: x=512, y=220
- Shoulder center: x=512, y=340
- Hip center: x=512, y=640

### Output
- PNG, 1024×1024, transparent background
- ONLY the base character — no scenery, no text, no grid, no frame boundaries
```

#### `prompts/generation.md` (Phase 2 — 8프레임 sheet)

```
{{STYLE_GUIDE}}
{{FRAME_SPEC}}

## Task: Base Rig — 8-frame animation sheet

Generate a 4-column × 2-row grid containing 8 poses of the SAME base rig
character. Cells read left-to-right, top-to-bottom.

### Canvas & layout
- Canvas: 1536×768 (4 cols × 384 + 2 rows × 384 — but tolerance ±16px OK)
- Actually use 1536×1024 (available size) and center content.
- Cell size: ~384×384 each
- NO grid lines visible in output — frame boundaries are invisible

### Cell-by-cell poses
Cell 0 (top-left): idle, standing relaxed, facing right
Cell 1: walk phase 1 — right foot forward, left arm swung forward
Cell 2: walk phase 2 — legs crossed mid-step, arms neutral
Cell 3: walk phase 3 — left foot forward, right arm swung forward
Cell 4 (row 2, col 0): walk phase 4 — legs crossed (mirror of cell 2)
Cell 5: jump rising — crouched, arms drawn back, about to leap
Cell 6: jump apex — airborne, legs tucked, arms spread
Cell 7: jump landing — knees bent, arms forward for balance

### Same across all 8 cells
- Identical body (same skin tone, same proportion, same nude + shorts)
- Identical head (bald, blank face)
- Facing right in all cells
- Feet on invisible ground line (ground plane same y across all cells)
- Character horizontally CENTERED within each cell (no x-drift)

### Output
- PNG, transparent background
- 8 poses of same character, same style, clean frame boundaries
```

---

### 4.2 `avatar-hair/` — 헤어 에이전트

#### 역할
헤어스타일 N종을 base rig 위에 얹히게 생성. 각 스타일은 색 팔레트 K개로 확장 가능.

#### 입력
`output/base-rig.png` 을 **레퍼런스 이미지**로 전달.

#### 출력
```
output/hair/
├── hair-short-messy_black.png        # 1024×1024, 8프레임 sheet
├── hair-short-messy_brown.png
├── hair-bob_black.png
├── ...
```

#### `config.yaml`

```yaml
name: avatar-hair
phase: 1
base_rig_path: "../output/base-rig.png"
output_dir: "../output/hair/"
max_retries: 3

styles:
  - id: short-messy
    description: "어깨 안 닿는 짧은 머리, 위로 삐죽삐죽 뻗친 스타일"
  - id: bob
    description: "단정한 단발, 귀 약간 가림"
  - id: long-straight
    description: "어깨선 아래 길이의 생머리"
  - id: ponytail
    description: "뒤로 묶은 포니테일, 높이 중간"
  - id: curly-afro
    description: "부드러운 곱슬 볼륨, 중간 길이"
  - id: side-parted
    description: "옆가르마, 이마 반 정도 가림"
  - id: bun
    description: "위로 올려 묶은 동그란 번"
  - id: undercut
    description: "옆머리 짧게 깎고 윗머리 살짝 긴"
  - id: wavy-medium
    description: "어깨 살짝 덮는 웨이브 미디엄"
  - id: braided
    description: "한 갈래 굵은 사이드 땋음"

colors:
  - { id: black, hex: "#1a1010" }
  - { id: dark-brown, hex: "#3d2818" }
  - { id: light-brown, hex: "#8b5a2b" }
  - { id: blond, hex: "#d4a574" }
  - { id: red, hex: "#c9302c" }
  - { id: purple, hex: "#9b7cb0" }
  - { id: pink, hex: "#d63384" }

validators:
  transparent_background: true
  opacity_ratio: [0.03, 0.25]       # 헤어만 있으므로 적게 채워짐
  alignment: head                    # rig head 영역과 정렬 검사
```

#### `prompts/system.md`

```
You are a specialized pixel-art hair sprite generator. Given a reference
base rig character, you produce hair-only sprites that align perfectly with
the rig's head position.

Critical rules:
- ONLY draw hair. No body, no face, no clothes — everything else fully transparent.
- Position hair exactly where it would sit on the reference rig's head.
- Hair can extend downward (long styles) or upward (spiky) but must
  originate from the rig's head position.
- Same art style as the reference rig (pixel art, bold outline, 2~3 tier shading).
- Match the specified style and color exactly.

You are given ONE hair style + color combination per call. Generate one image.
```

#### `prompts/idle.md` (Phase 1 — idle 단일 프레임)

```
{{STYLE_GUIDE}}

## Task: Hair sprite (idle pose, matching base rig)

Reference image attached: the base rig character.

### This variation
- Style: {{HAIR_STYLE}} — {{HAIR_DESCRIPTION}}
- Color: {{HAIR_COLOR_HEX}}

### Must include
- Hair drawn ONLY — everything else (body, face, background) must be
  fully transparent.
- Hair positioned to sit on the reference rig's head (anchor at the head
  center visible in the reference).
- Style and flow appropriate for an idle standing pose — no wind,
  no motion.

### Must NOT include
- No body, no skin, no face features.
- No background, no shadow.
- No other characters.

### Output
- PNG, 1024×1024, transparent background
- Hair sprite aligned to reference rig head
```

**치환**:
- `{{HAIR_STYLE}}`: "short-messy"
- `{{HAIR_DESCRIPTION}}`: config 의 description
- `{{HAIR_COLOR_HEX}}`: "#1a1010"

#### `prompts/animated.md` (Phase 2 — 8프레임)

```
{{STYLE_GUIDE}}
{{FRAME_SPEC}}

## Task: Hair sprite — 8-frame animation sheet

Reference image attached: base rig 8-frame sheet (same 4×2 grid layout).

### This variation
- Style: {{HAIR_STYLE}} — {{HAIR_DESCRIPTION}}
- Color: {{HAIR_COLOR_HEX}}

### Task
Generate hair-only 4×2 grid. Each cell contains hair drawn to match the
corresponding cell of the reference rig. Rest of each cell must be
fully transparent.

### Frame-specific motion (hair should follow body)
- Cells 0 (idle), 5, 6, 7 (jump): hair static, natural rest position
- Cells 1–4 (walk loop): hair has subtle bounce/flow matching walk rhythm
  - Long hair: slight sway backward as character moves forward
  - Short hair: minimal motion, just tip drift
  - Curly/afro: gentle bob
- Cell 6 (jump apex): hair rises slightly (gravity + air)
- Cell 7 (landing): hair compresses/flattens briefly

### Consistency across cells
- Same hair style, same color, same volume in all 8 cells
- Only motion differs

### Output
- PNG, transparent background, 1536×1024 (or same size as reference rig)
- Hair-only, clean alignment with reference rig positions
```

---

### 4.3 `avatar-top/` — 상의 에이전트

#### 역할
상의 N종 × 색상 K종 → 각 sprite sheet 1장.

#### `config.yaml`

```yaml
name: avatar-top
phase: 1
base_rig_path: "../output/base-rig.png"
output_dir: "../output/top/"
max_retries: 3

styles:
  - id: tshirt-plain
    description: "반팔 기본 티셔츠, 라운드넥"
  - id: hoodie
    description: "후드 달린 풀집 후드티, 앞지퍼 없음"
  - id: polo
    description: "카라+단추 3개 폴로 셔츠, 소매 살짝 타이트"
  - id: jersey
    description: "스포츠 저지, 숫자 프린트 느낌 살짝 (숫자 텍스트는 추상화)"
  - id: blazer
    description: "깔끔한 블레이저, 안 단추 잠금"
  - id: tank
    description: "민소매 탱크톱"
  - id: sweater
    description: "니트 스웨터, 긴팔"
  - id: button-up
    description: "버튼다운 셔츠, 장옷깃"
  - id: windbreaker
    description: "후드 없는 바람막이 점퍼"
  - id: cardigan
    description: "오픈 카디건, 안쪽 기본 티셔츠 보임"

colors:
  - { id: red, hex: "#e63946" }
  - { id: teal, hex: "#2a9d8f" }
  - { id: navy, hex: "#264653" }
  - { id: orange, hex: "#f4a261" }
  - { id: gray, hex: "#6c757d" }
  - { id: white, hex: "#ffffff" }
  - { id: black, hex: "#1a1a1a" }
  - { id: pastel-blue, hex: "#a8dadc" }

validators:
  transparent_background: true
  opacity_ratio: [0.08, 0.25]
  alignment: torso
```

#### `prompts/system.md`

```
You are a specialized pixel-art upper-garment (shirt/top) sprite generator.
Given a reference base rig character, you produce clothing that fits the
rig's torso + arms precisely.

Critical rules:
- Draw ONLY the garment — no body, no head, no legs, no face, no pants.
  Everything except the garment must be fully transparent.
- The garment must follow the rig's torso and arm positions in each frame.
- Same art style as reference rig.
- Match specified style and color.
```

#### `prompts/idle.md`

```
{{STYLE_GUIDE}}

## Task: Upper garment sprite (idle pose)

Reference image attached: base rig character (idle pose).

### This variation
- Style: {{TOP_STYLE}} — {{TOP_DESCRIPTION}}
- Color: {{TOP_COLOR_HEX}}

### Must include
- Garment covering rig's shoulders to hip line.
- Sleeves covering arms to rig's wrist positions.
- Basic fold/shading where natural (shoulder creases, bottom hem).

### Must NOT include
- No body parts, no head, no pants, no shoes.
- No text or logos printed on the garment (except jersey-style
  abstract shape).
- No background.

### Output
- PNG, 1024×1024, transparent background
- Only the top garment, positioned to fit the reference rig
```

#### `prompts/animated.md`

```
{{STYLE_GUIDE}}
{{FRAME_SPEC}}

## Task: Upper garment — 8-frame animation sheet

Reference image attached: base rig 8-frame sheet.

### This variation
- Style: {{TOP_STYLE}} — {{TOP_DESCRIPTION}}
- Color: {{TOP_COLOR_HEX}}

### Task
Generate garment-only 4×2 grid. Each cell matches corresponding rig cell's
torso + arm position.

### Frame-specific motion
- Cells 0, 5–7: garment follows static torso/arm positions
- Cells 1–4 (walk): slight sleeve swing, hem bounce
- Cells 5–7 (jump): slight garment lift on rise (cell 5–6), 
  compression on landing (cell 7)

### Consistency
- Same garment style + color across all 8 cells
- Only cloth motion differs

### Output
- PNG, transparent background, matching size of reference rig sheet
- Garment-only, clean alignment
```

---

### 4.4 `avatar-bottom/` — 하의 에이전트

`avatar-top/` 과 구조 동일. 차이:

- styles: `jeans`, `shorts`, `slacks`, `skirt`, `joggers`, `chinos`, `leggings`
- `alignment: legs`
- 프레임별 모션: 걷기에서 다리 확실하게 벌어짐/교차 강조

(디렉티브 프롬프트는 `avatar-top/` 의 "upper garment" → "lower garment",
"shoulders to hip" → "hip to ankles" 로 치환. 전체 구조는 동일.)

---

### 4.5 `avatar-face-eyes/` — 눈 에이전트

#### 역할
8가지 표정의 눈 세트 생성. **애니메이션 프레임이 아니라 감정 베리에이션**.

#### `config.yaml`

```yaml
name: avatar-face-eyes
phase: 1
base_rig_path: "../output/base-rig.png"
output_dir: "../output/face-eyes/"
max_retries: 3

variations:
  - id: neutral
    description: "기본 상태, 동그란 눈 + 작은 속눈썹"
  - id: happy
    description: "웃는 눈 (초승달 형태)"
  - id: surprised
    description: "놀란 눈 (크게 뜬, 동공 축소)"
  - id: sad
    description: "슬픈 눈 (눈썹 팔자, 아래로 쳐짐)"
  - id: angry
    description: "화난 눈 (눈썹 사선 아래로, 날카로운 인상)"
  - id: tired
    description: "피곤한 눈 (반쯤 감음, 눈 밑 그늘)"
  - id: confused
    description: "의문의 눈 (한쪽 눈썹만 올라감)"
  - id: wink
    description: "한쪽 감은 눈 + 다른 쪽 웃음"

# 눈은 몸 동작 무관 — 각 variation 1프레임, 1024×1024 개별 출력
# (단일 이미지 — 4×2 grid 안 씀)

validators:
  transparent_background: true
  opacity_ratio: [0.005, 0.04]   # 눈은 작아서 픽셀 비율 매우 적음
  alignment: head_eyes           # rig head 의 눈 위치 근처
```

#### `prompts/system.md`

```
You are a specialized pixel-art eye sprite generator. You produce the eyes
(pupils, eyelashes, eyebrows) that will layer on top of a blank-face base rig.

Critical rules:
- Draw ONLY the eyes + eyebrows. No skin, no face outline, no nose, no mouth.
- Everything except eye pixels must be fully transparent.
- Both eyes visible (side-view still shows one near + one far eye subtly,
  or use stylized "both-visible" convention common in Korean web-game
  pixel art where profile shows both eyes simplified).
- Size: eyes are small — only a few pixels across in final sprite scale.
- Match specified expression exactly.
```

#### `prompts/generation.md`

```
{{STYLE_GUIDE}}

## Task: Eye expression sprite

Reference image attached: base rig (idle pose, blank face).

### This variation
- Expression: {{EYE_EXPRESSION}} — {{EYE_DESCRIPTION}}

### Must include
- Both eyes (pixel art convention: even side-view shows both eyes slightly
  simplified, like MapleStory/Mabinogi).
- Eyebrows if they naturally pair with the expression.
- Eyes positioned to align with the rig's head (visible in reference).

### Must NOT include
- No other face features (no nose, no mouth).
- No hair, no skin — only eye and eyebrow pixels are opaque.
- No background.

### Style notes for this expression
{{EXPRESSION_STYLE_NOTES}}

### Output
- PNG, 1024×1024, transparent background
- Only eye + eyebrow pixels, positioned on the rig's head
```

**치환 예 (`{{EXPRESSION_STYLE_NOTES}}`)**:

| variation | notes |
|---|---|
| neutral | "Simple round pupils, small upper lashes, eyebrows straight and slightly apart" |
| happy | "Eyes as thin upward crescents (smile eyes), eyebrows curved up" |
| surprised | "Eyes wide open circles, small pupils inside, eyebrows raised high" |
| sad | "Lower eyelid curved up, small tear optional, eyebrows slanted inward-upward (팔자)" |
| angry | "Eyebrows sharp diagonal downward-inward, pupils small and intense" |
| tired | "Eyes half-closed, lids heavy, small bags underneath, eyebrows relaxed low" |
| confused | "One eyebrow higher than the other, pupils slightly asymmetric" |
| wink | "One eye closed as curved line, other eye normal with pupil, slight smile tilt" |

---

### 4.6 `avatar-face-mouth/` — 입 에이전트

구조는 `avatar-face-eyes/` 와 동일. 차이:

- variations: `neutral`, `happy`, `open-shouting`, `small-smile`, `frown`, `surprised-o`, `pout`, `talking`
- `alignment: head_mouth`
- 프롬프트: "Draw ONLY the mouth. No eyes, no nose, no face outline, no hair..."

---

## 5. Phase 로드맵

### Phase 1 — Static Idle only (1~2주)
**목표**: 모든 파트의 idle 1프레임 확보. 움직임 없음.

- base-rig: idle 1프레임 (1024×1024)
- hair/top/bottom: 각 N종 × idle (1024×1024)
- face-eyes/mouth: 각 8 variant × 1프레임

**가치**: 유저가 커스터마이즈 UI 에서 조합 선택 → 정적 아바타로 월드 이동.
걸을 때 움직임은 없지만 **실용 가능 수준**.

### Phase 2 — Animation Frames (2~3주, 반복 튜닝)
**목표**: 몸/의상/헤어의 8프레임 sprite sheet. 얼굴은 Phase 1 그대로.

- base-rig: 8프레임 sheet 재생성 (가장 까다로움, 시간 투자)
- hair/top/bottom: base-rig 8프레임 레퍼런스로 각각 8프레임
- 실패 프레임만 개별 재생성 (cell 추출 후 단일 요청)

**가치**: walk cycle + jump 작동. 실제 메이플식 감각.

### Phase 3 — Manual Polish (1주+, 아티스트 or 사용자)
**목표**: Aseprite/Piskel 에서 pixel-perfect 보정.

- 프레임간 x-drift 정리
- 헤어/의상 offset 미세 조정
- 프레임별 1~2픽셀 tweak

**가치**: 상용 품질.

---

## 6. 실행 · 검증 · 배포

### 6.1 설치 (최초 1회)

```bash
cd data/agents
pnpm install                       # 루트 package.json — 모든 에이전트 공용 deps
cp .env.example .env
# .env 에 OPENAI_API_KEY 입력
```

### 6.2 에이전트 실행

```bash
# Step 1: base-rig 확정 (성공할 때까지 반복)
pnpm --filter avatar-base-rig run generate
# 결과 output/base-rig.png 검수 → 마음에 들 때까지 재실행

# Step 2: 파트 에이전트 병렬 실행
pnpm --filter avatar-hair run generate &
pnpm --filter avatar-top run generate &
pnpm --filter avatar-bottom run generate &
pnpm --filter avatar-face-eyes run generate &
pnpm --filter avatar-face-mouth run generate &
wait

# 또는 순차
pnpm run generate:all
```

### 6.3 재생성 (특정 항목만)

```bash
# 특정 hair style + color 만
pnpm --filter avatar-hair run generate -- --style=bob --color=pink

# 실패 로그에서 재시도
pnpm --filter avatar-hair run retry --from=output/hair/_failed.json
```

### 6.4 검수

```bash
# 생성된 이미지 전체 html 갤러리로 미리보기
pnpm run preview
# → http://localhost:7000 에서 grid 로 보기
```

### 6.5 배포

```bash
# 마음에 든 것만 dist/ 로 promote
pnpm run promote -- output/hair/hair-bob_pink.png
# 또는 interactive TUI
pnpm run promote:ui

# dist/ 에 모인 것 public/ 로 복사 + DB seed 생성
pnpm run publish
# → public/metaverse/avatars/{category}/ 에 복사
# → supabase/migrations/YYYYMMDD_avatar_parts_seed.sql 생성
#   (대시보드에서 사용자가 수동 적용)
```

---

## 7. DB 스키마

### 7.1 새 마이그레이션 (Phase 1 이후 생성)

```sql
CREATE TABLE metaverse_avatar_parts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  part_type text NOT NULL CHECK (part_type IN (
    'base', 'hair', 'top', 'bottom', 'face_eyes', 'face_mouth'
  )),
  style_id text NOT NULL,              -- 'short-messy'
  color_id text,                       -- 'black' (base/face 는 null)
  display_name text NOT NULL,          -- '짧은 헝클머리 - 검정'
  sprite_url text NOT NULL,            -- '/metaverse/avatars/hair/short-messy_black.png'
  is_animated boolean NOT NULL DEFAULT false,  -- Phase 2 8프레임 여부
  frame_count int NOT NULL DEFAULT 1,
  sort_order int DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (part_type, style_id, color_id)
);

CREATE INDEX ON metaverse_avatar_parts(part_type, sort_order)
  WHERE is_active = true;

ALTER TABLE metaverse_avatar_parts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "avatar_parts_public_read" ON metaverse_avatar_parts
  FOR SELECT USING (is_active = true);

-- profiles 확장: 유저의 현재 아바타 설정
ALTER TABLE profiles ADD COLUMN avatar_config jsonb DEFAULT '{}'::jsonb;
-- 예시: {
--   "hair": "short-messy",
--   "hair_color": "black",
--   "top": "hoodie",
--   "top_color": "red",
--   "bottom": "jeans",
--   "bottom_color": "navy",
--   "eyes": "neutral",
--   "mouth": "neutral"
-- }
```

### 7.2 Seed 파일 자동 생성 (`publish` 커맨드)

에이전트 publish 시 `dist/` 에 있는 파일들을 SELECT→INSERT SQL 로 뽑아서
`supabase/migrations/YYYYMMDD_metaverse_avatar_parts_seed_N.sql` 로 출력.

---

## 8. 기존 코드 연결

### 8.1 `LayeredAvatar` Phaser 클래스 (신규)

```
lib/metaverse/avatar/
├── types.ts                       # AvatarConfig, PartDef
├── layered-avatar.ts              # Phaser Container 확장
├── loader.ts                      # 파트 스프라이트 preload helper
└── animations.ts                  # frame index → animation key 매핑
```

```ts
// lib/metaverse/avatar/layered-avatar.ts (요약)
export class LayeredAvatar extends Phaser.GameObjects.Container {
  private layers = {
    base: this.scene.add.sprite(0, 0, "base-rig"),
    bottom: this.scene.add.sprite(0, 0, "bottom-jeans_navy"),
    top: this.scene.add.sprite(0, 0, "top-hoodie_red"),
    eyes: this.scene.add.sprite(0, 0, "eyes-neutral"),
    mouth: this.scene.add.sprite(0, 0, "mouth-neutral"),
    hair: this.scene.add.sprite(0, 0, "hair-short-messy_black"),
  }

  applyConfig(config: AvatarConfig) {
    this.layers.hair.setTexture(`hair-${config.hair}_${config.hair_color}`)
    // ... etc
  }

  playAnimation(name: "idle" | "walk" | "jump") {
    // 모든 레이어에 동일 프레임 키 재생
    Object.values(this.layers).forEach(s => s.play(`${name}:${s.texture.key}`))
  }

  setFlipX(flip: boolean) {
    Object.values(this.layers).forEach(s => s.setFlipX(flip))
  }
}
```

### 8.2 교체 지점

- `lib/metaverse/scenes/world-map-scene.ts` — `this.player` 와 `RemoteAvatar` 모두 `LayeredAvatar` 로 교체
- `lib/metaverse/scenes/side-scroller-scene.ts` — 동일
- `components/metaverse/avatar-customize-modal.tsx` (신규) — 탭 4개 (헤어/상의/하의/얼굴) + 실시간 프리뷰

---

## 9. 예상 비용 · 일정

### 비용 (`gpt-image-1` 기준)

| 항목 | 장수 | 단가 | 합계 |
|---|---|---|---|
| base-rig Phase 1 | 10회 재시도 | $0.17 | $1.7 |
| base-rig Phase 2 (8프레임) | 15회 재시도 | $0.17 | $2.5 |
| hair × 10 styles × 7 colors × Phase 1 | 70 | $0.17 | $12 |
| hair Phase 2 (8프레임) | 70 × 2회 | $0.17 | $24 |
| top 10 × 8 colors × Phase 1 | 80 | $0.17 | $14 |
| top Phase 2 | 80 × 2 | $0.17 | $27 |
| bottom 6 × 4 colors × Phase 1 | 24 | $0.17 | $4 |
| bottom Phase 2 | 24 × 2 | $0.17 | $8 |
| face-eyes 8 variants | 8 × 2 | $0.17 | $2.7 |
| face-mouth 8 variants | 8 × 2 | $0.17 | $2.7 |
| **총합** | | | **≈ $100** |

재시도 포함한 현실적 추정. 실제론 ±30%.

### 일정 (경험 없을 경우)

| Phase | 기간 | 주요 작업 |
|---|---|---|
| 에이전트 스캐폴딩 | 2~3일 | 폴더/설정/프롬프트 파일 만들기 |
| Phase 1 첫 결과물 | 3~5일 | base-rig 확정 + 파트 1종씩 돌려보기 |
| Phase 1 배치 완료 | 1주 | 모든 파트 × 색상 조합 |
| `LayeredAvatar` + UI | 1주 | 씬 교체 + 커스터마이즈 모달 |
| Phase 2 시도 | 1~2주 | 8프레임 sheet 튜닝 |
| Phase 3 폴리싱 | 장기 | Aseprite 수작업 |

---

## 부록: 프롬프트 엔지니어링 팁

1. **레퍼런스 이미지 중요도**: base-rig 확정 후 다른 에이전트에 꼭 전달.
   없으면 정렬 실패율 치솟음.
2. **"no background" 는 강조 반복**: "transparent background, no floor,
   no shadow, no sky, isolate character only" — 모델이 이따금 배경 그림.
3. **실패 패턴 분석**: 자주 나오는 실패 양상(예: "눈이 너무 크다", "배경 꺼짐")
   별로 프롬프트에 negative constraint 추가.
4. **Grid 생성 시 cell 분리선**: "NO visible grid lines, NO frame borders drawn" 명시.
5. **"same character in every cell"**: 8프레임 생성 시 일관성 유지 키워드.
6. **색상 코드 직접 명시**: "color #1a1010" 이 "dark brown" 보다 정확.
7. **Post-processing 계획**: GPT 결과를 sharp 로 자동 crop/resize 예정이라
   약간의 여유 공간 있어도 무방. 1~5px drift 는 허용.

---

## 부록: 실패 대응 플로우

```
generate → validate
          │
     ┌────┴────┐
     │         │
   통과       실패
     │         │
     ▼         ▼
save   retry with tweaked prompt
              │
     ┌────────┴────────┐
   통과               3회 실패
     │                 │
     ▼                 ▼
   save      log to _failed.json
             수동 검토 후 프롬프트 조정
```

`_failed.json` 에는:
- 입력 config
- 시도한 프롬프트 전체
- 실패한 validator 이름 + 상세

→ 사람이 보고 프롬프트 튜닝 (예: "눈 너무 커" → "smaller pixel eyes, max 4px wide" 추가).

---

작성 진행 중 막히는 부분 있으면 언제든 문의 — 특정 에이전트 프롬프트를
더 구체화하거나, 실제 구현 코드(run.ts, openai wrapper 등) 도 작성해드립니다.
