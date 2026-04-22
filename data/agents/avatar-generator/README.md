# Avatar Generator Agent — 셋업 가이드

메타버스 사이드뷰 아바타 스프라이트를 GPT 이미지 모델(`gpt-image-1`)로 배치 생성하는 에이전트.

**목표**: 사용자가 커스터마이징할 수 있는 헤어·상의·하의·얼굴 파트 (또는 완성형 프리셋)를 일관된 픽셀아트 스타일로 자동 생성.

---

## 1. 📂 폴더 구조

```
data/agents/avatar-generator/
├── README.md               # 이 파일
├── package.json            # 에이전트 전용 deps (openai, sharp, yaml, pino)
├── .env.example            # 환경변수 템플릿
├── .gitignore              # output/ + .env 제외
├── config.yaml             # 생성 스펙 (무엇을 몇 개 만들지)
├── prompts/
│   ├── style-guide.md      # 공통 스타일 디렉티브 (모든 프롬프트에 삽입)
│   ├── preset-full.md      # Phase A: 완성형 캐릭터 프롬프트
│   ├── base-rig.md         # Phase B: 레이어링용 베이스 레퍼런스
│   ├── hair.md             # 헤어 파트 변형 프롬프트
│   ├── top.md              # 상의
│   ├── bottom.md           # 하의
│   └── face.md             # 얼굴 (눈/코/입 묶음)
├── src/
│   ├── run.ts              # CLI 엔트리포인트
│   ├── generate.ts         # OpenAI API 호출 래퍼
│   ├── pipeline.ts         # 단계별 오케스트레이션
│   ├── validators/
│   │   ├── dimensions.ts   # 캔버스 크기 검증
│   │   └── transparency.ts # 투명 배경 검증
│   └── save.ts             # 파일 저장 + 매니페스트 업데이트
├── output/                 # 생성 결과 임시 저장 (gitignore)
│   ├── presets/
│   └── parts/
└── dist/                   # 최종 확정된 파일을 public/metaverse/avatars/ 로 배포
```

**파이프라인 흐름**:
1. `config.yaml` 읽기
2. 각 항목에 대해 `prompts/*.md` + style-guide 합쳐서 최종 프롬프트 조립
3. OpenAI API 호출 → 이미지 다운로드
4. 검증 (크기/투명도) → 통과하면 `output/` 저장, 실패하면 재시도 (최대 3회)
5. `output/manifest.json` 에 결과 기록 (어떤 프롬프트로 뭐가 나왔는지)
6. 수동 검수 후 마음에 드는 것만 `dist/` → `public/metaverse/avatars/` 로 복사 + DB seed 갱신

---

## 2. 🔐 환경 변수

`.env` 파일:

```bash
# 필수
OPENAI_API_KEY=sk-...

# 선택 (기본값)
OPENAI_IMAGE_MODEL=gpt-image-1
# 대안: dall-e-3 (호환용)

# 출력 크기 — 내부 생성은 고해상도, 최종은 pixel-art 다운스케일
OUTPUT_GEN_SIZE=1024x1024
OUTPUT_FINAL_SIZE=128x192

# 재시도 정책
MAX_RETRIES_PER_ITEM=3
RATE_LIMIT_MS=1500
```

API 키 비용 감각:
- `gpt-image-1` : $0.04 ~ $0.17 / 이미지 (품질 설정)
- 프리셋 50장 ≈ $5
- 레이어드 실험 (파트 5종 × 10 배리에이션 + 재시도) ≈ $15~$30

---

## 3. ⚙️ config.yaml 포맷

```yaml
# 공통 설정
style:
  view: "side"                  # side | 3/4-top-down
  canvas_gen: [1024, 1024]      # 생성 해상도 (pixel-art 전 원본)
  canvas_final: [128, 192]      # 최종 스프라이트 해상도 (64×96 * 2배)
  palette: "soft-korean-webgame" # 색 톤 키 (style-guide.md 에 정의)

# Phase A — 완성형 프리셋 배치 생성
presets:
  enabled: true
  count: 50                     # 총 몇 장
  seed_traits:                  # 각각에 무작위로 조합될 특성
    gender: [male, female, non-binary]
    age: [teen, young-adult, adult]
    vibe: [casual, athletic, preppy, street, quiet, cheerful]
    hair_length: [short, medium, long]
    color_family: [warm, cool, neutral, vibrant]

# Phase B — 레이어드 파트 생성
layered:
  enabled: false                # Phase A 성공 후 true 로 전환
  base_rig:
    file: "base-rig.png"
    regenerate: false           # 한 번 확정되면 false 로 잠금
  parts:
    hair:
      count: 10
      variations: [short-messy, bob, long-straight, ponytail, curly-afro,
                   side-parted, bun, undercut, wavy-medium, braided]
      colors: ["#1a1010", "#3d2818", "#8b5a2b", "#d4a574", "#9b7cb0", "#d63384"]
    top:
      count: 10
      variations: [tshirt-plain, hoodie, polo, jersey, blazer, tank,
                   sweater, button-up, windbreaker, cardigan]
      colors: ["#e63946", "#2a9d8f", "#264653", "#f4a261", "#6c757d", "#ffffff"]
    bottom:
      count: 6
      variations: [jeans, shorts, slacks, skirt, joggers, chinos]
      colors: ["#1d3557", "#343a40", "#8b6f47", "#e5e5e5"]
    face:
      count: 5
      variations: [default, smiley, serious, curious, sleepy]

# 검증 규칙
validators:
  transparent_background: true
  min_opacity_ratio: 0.05       # 최소 5% 픽셀이 불투명해야 (빈 이미지 거부)
  max_opacity_ratio: 0.7        # 70% 초과면 배경이 안 지워진 것
  aspect_ratio_tolerance: 0.02  # ±2% 허용

# 후처리
postprocess:
  pixel_art_downsample: true    # 1024 → 128 nearest-neighbor 다운스케일
  background_removal: fallback  # GPT 가 투명 안 주면 sharp 로 흰 배경 투명화
```

---

## 4. 📝 프롬프트 템플릿

### `prompts/style-guide.md` (공통 삽입)

```markdown
## 공통 아트 스타일

- **Art Style**: Korean web-game pixel art (MapleStory / Mabinogi 감성).
  Crisp pixel edges, soft warm palette, slightly saturated, 2~3단 shading.
- **View**: side-view (side profile, facing right by default).
- **Canvas**: square 1024×1024 background, character occupies center.
- **Background**: FULLY TRANSPARENT (alpha channel, not white).
  Do not add any scenery, floor, or shadow underneath the character.
- **Proportion**: cute-ish semi-chibi — head slightly larger than realistic,
  roughly 4~5 head-tall body.
- **Line weight**: bold outer contour (dark outline), subtle inner lines.
- **No text, no logos, no watermarks.**
- **No photo-realism.** Flat colors + minimal gradient.
```

### `prompts/preset-full.md` (Phase A — 완성형 프리셋)

```markdown
{STYLE_GUIDE}

## Task

Generate ONE complete side-view pixel-art character standing in a neutral
idle pose, facing right.

### Character traits for this variation
- Gender: {GENDER}
- Age: {AGE}
- Vibe: {VIBE}
- Hair length: {HAIR_LENGTH}
- Color family: {COLOR_FAMILY}

### Must include
- Full body (head to feet, standing on invisible ground).
- Hair with distinct style and color.
- Upper garment (shirt/hoodie/jersey/etc. matching vibe).
- Lower garment (jeans/shorts/skirt/etc. matching vibe).
- Visible eyes, nose, mouth (simple but expressive, not realistic).
- Arms down at sides, legs straight (idle pose).

### Must NOT include
- No props, no weapons, no hats (unless "preppy" vibe → soft beanie OK).
- No background, no shadow on floor, no effects.
- No text or UI elements.

### Output
- Transparent PNG, 1024×1024, character centered horizontally,
  feet at approximately y=880, head top at approximately y=120.
- Character width approximately 280px at widest point.
```

**사용 예 (코드에서 치환)**:
```ts
const prompt = template
  .replace("{STYLE_GUIDE}", styleGuide)
  .replace("{GENDER}", "female")
  .replace("{AGE}", "young-adult")
  .replace("{VIBE}", "street")
  .replace("{HAIR_LENGTH}", "medium")
  .replace("{COLOR_FAMILY}", "cool")
```

### `prompts/base-rig.md` (Phase B — 레이어링 베이스)

```markdown
{STYLE_GUIDE}

## Task

Generate a reference BASE CHARACTER for paper-doll layering.
This character will NOT be used directly — it's the skeleton that all
hair/top/bottom/face parts will align against.

### Must include
- Fully nude base body silhouette (pale skin, androgynous, neutral).
- NO hair — completely bald head with visible scalp.
- Undergarments only (skin-tone tight shorts OK for modesty), NO shirt.
- Blank face — no eyes, no nose, no mouth (just skin-tone oval head).
- Standing idle pose, facing right, arms down.

### Layout anchors (CRITICAL for layering)
- Canvas: 1024×1024, transparent background.
- Character feet at y=880.
- Body center (navel) at x=512, y=600.
- Head top at y=120.
- Head center at x=512, y=200.
- Shoulder line at y=330.
- Hip line at y=580.

### Mark reference points (lightly visible, will be removed later)
Draw faint 1px red dots at: head center, shoulder center, hip center,
each feet. These let me align parts visually.
```

### `prompts/hair.md`

```markdown
{STYLE_GUIDE}

## Task

Generate ONE hairstyle sprite for the paper-doll layering system.

### Variation
- Style: {HAIR_STYLE}       # e.g. "short-messy", "bob", "long-straight"
- Color: {HAIR_COLOR_HEX}   # e.g. "#1a1010"

### Reference
I'm providing a base character image. Draw ONLY the hair — nothing else.
The hair must sit precisely on the base character's head without
overlapping face area (face is visible from forehead down).

### Must include
- Hair on top of head + around if style requires (e.g. long hair down sides).
- Same cute-ish pixel art style as base.

### Must NOT include
- NO body, NO face, NO ears (ears stay visible through hair if style allows).
- NO shadow on skin.
- Background: fully transparent.

### Output
- Transparent PNG, 1024×1024.
- Hair positioned to match the reference base character head.
- Only hair pixels are opaque; everything else fully transparent.
```

**치환 변수**:
- `{HAIR_STYLE}`: config 의 variations 에서 뽑음
- `{HAIR_COLOR_HEX}`: 색상 코드

**호출 시 `base-rig.png` 를 레퍼런스 이미지로 함께 전달**:
```ts
const response = await openai.images.generate({
  model: "gpt-image-1",
  prompt: hairPrompt,
  image: [await fs.readFile("output/base-rig.png")],
  size: "1024x1024",
  background: "transparent",
})
```

### `prompts/top.md` / `prompts/bottom.md` (유사 패턴)

```markdown
{STYLE_GUIDE}

## Task

Generate ONE upper garment sprite for the paper-doll layering system.

### Variation
- Garment: {TOP_STYLE}       # e.g. "hoodie", "tshirt-plain", "jersey"
- Color: {TOP_COLOR_HEX}

### Reference
Base character image provided. Draw ONLY the upper garment — nothing else.
Must fit on the body from shoulders to hips, covering the torso and arms.

### Must include
- Sleeves + body of the garment.
- Basic folds/shading where needed.

### Must NOT include
- NO body (skin), NO head, NO legs, NO pants.
- NO accessories or prints unless the garment is pattern-based.
- Background: fully transparent.

### Output
- Transparent PNG, 1024×1024.
- Garment positioned to match reference character torso + arms.
- Only garment pixels are opaque.
```

### `prompts/face.md`

```markdown
{STYLE_GUIDE}

## Task

Generate ONE face expression set (eyes + nose + mouth as a single image).

### Variation
- Expression: {FACE_EXPRESSION}   # "default" | "smiley" | "serious" | "curious" | "sleepy"

### Reference
Base character image provided. Draw ONLY the facial features
(eyes, nose, mouth) positioned on the blank face of the reference.

### Must include
- Two eyes aligned horizontally.
- Small/minimal nose (pixel nose — 1~3 pixels usually).
- Mouth matching the expression.

### Must NOT include
- NO hair, NO head outline (head is provided by base).
- NO neck, NO shoulders.
- Background: fully transparent.

### Output
- Transparent PNG, 1024×1024.
- Features positioned to match reference head.
```

---

## 5. 🚀 실행 방법

### 설치 (최초 1회)

```bash
cd data/agents/avatar-generator
pnpm install
cp .env.example .env
# .env 에 OPENAI_API_KEY 입력
```

### 생성

```bash
# Phase A — 프리셋 50장 배치
pnpm run generate:presets

# Phase B — 레이어드 파트
# 1. 베이스 rig 먼저 (1회, 성공할 때까지 반복)
pnpm run generate:base-rig

# 2. 수동 검수 후 output/base-rig.png 확정 → config.yaml 에서
#    base_rig.regenerate: false 로 잠금

# 3. 파트 전체 생성 (base 레퍼런스 사용)
pnpm run generate:parts

# 또는 특정 타입만
pnpm run generate:parts -- --type=hair
pnpm run generate:parts -- --type=top --count=5
```

### 검수 + 배포

```bash
# output/manifest.json 에 결과 기록됨. 이미지 직접 보고 OK 한 것만 dist/ 로 이동
pnpm run promote -- output/presets/preset-034.png

# dist/ 에 쌓인 것들을 public/ 로 복사 + DB seed 생성
pnpm run publish
# → public/metaverse/avatars/ 에 복사
# → supabase/migrations/YYYYMMDD_avatar_parts_seed.sql 파일 생성
#    (사용자가 대시보드에 적용)
```

---

## 6. ✅ 검증 규칙 (자동 폐기)

각 생성 이미지는 저장 전 다음 체크 통과해야 함:

1. **크기**: `config.style.canvas_gen` 과 정확히 일치
2. **투명 배경**: 모서리 영역의 평균 알파 < 0.05
3. **유의미한 내용**: 불투명 픽셀 비율이 5~70% 범위 (너무 적으면 빈 이미지, 너무 많으면 배경 안 지워진 상태)
4. **(파트용) 정렬**: base-rig 의 head/torso 영역과 파트의 불투명 영역이 의미적으로 겹침 (hair 는 head, top 은 torso 등)

실패 시:
- 자동 재시도 (프롬프트 약간 수정 — "ensure transparent background" 등 강조)
- `MAX_RETRIES_PER_ITEM` 도달 시 포기 후 로그

---

## 7. 💡 핵심 주의사항

### ✅ 잘 되는 것
- 완성형 프리셋 50장 배치 생성 (Phase A): 성공률 **85%+**
- 레이어드 base rig 1장 확정: 여러 번 재생성 필요하지만 가능
- 정적 파트 (idle 포즈 1프레임) 생성 + 얼추 정렬: 성공률 **60~70%**

### ⚠️ 어려운 것
- **애니메이션 프레임 정렬** (walk 4장이 픽셀 단위로 정확히 맞음): GPT 단독으로는 거의 불가. 아세프라이트 등에서 수작업 보정 필수.
- **10가지 hair 가 모두 정확히 같은 head 위치**: 어느 정도는 맞지만 픽셀 완벽은 아님. 최종 단계에서 수동 offset 조정 예상.

### 🔧 대응 전략
- **Phase A 먼저 완주** → 프리셋 모드만으로도 유저 체험 OK
- **Phase B 는 idle 포즈만** → 움직이지 않는 정적 아바타 (Mabinogi 프로필 같은 느낌)
- **Phase C (애니메이션)** 로 가면 아티스트 수작업 필요 — 이때 에이전트는 "초안 생성기" 역할

---

## 8. 🗄️ DB 연결

### 프리셋 (Phase A)

기존 `pixel_art_items` 테이블 재활용 가능:
```sql
INSERT INTO pixel_art_items (id, slug, name, image_url, category, price)
VALUES
  (gen_random_uuid(), 'preset-01', '캐주얼 여학생', '/metaverse/avatars/preset-01.png', 'avatar', 0),
  ...
```

`profiles.equipped_pixel_art_id` 로 유저가 선택한 프리셋 기억.

### 레이어드 (Phase B) — 신규 테이블 필요

```sql
CREATE TABLE metaverse_avatar_parts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  part_type text NOT NULL CHECK (part_type IN ('hair', 'top', 'bottom', 'face')),
  style_id text NOT NULL,
  display_name text NOT NULL,
  sprite_url text NOT NULL,
  default_color text,
  sort_order int DEFAULT 0,
  is_active boolean DEFAULT true,
  UNIQUE (part_type, style_id)
);

ALTER TABLE profiles ADD COLUMN avatar_config jsonb;
-- 예: {"hair": "short-messy", "hair_color": "#1a1010",
--      "top": "hoodie", "top_color": "#e63946", ...}
```

---

## 9. 🔗 연결될 것 (지금 기존 코드)

- `lib/metaverse/scenes/side-scroller-scene.ts` — 현재 placeholder rect 아바타. `LayeredAvatar` 로 교체 예정.
- `lib/metaverse/scenes/world-map-scene.ts` — 동일하게 LayeredAvatar 재사용 (탑다운일 때도 동일 파트 시스템 가능, 단 스프라이트는 다른 뷰 필요).
- `components/profile/public-profile.tsx` — 프로필에도 아바타 표시.
- 신규: `components/metaverse/avatar-customize-modal.tsx` — 탭 기반 커스터마이즈 UI.

---

## 10. 📚 참고

- OpenAI `gpt-image-1` docs: https://platform.openai.com/docs/guides/images
- `sharp` (이미지 후처리): https://sharp.pixelplumbing.com/
- LPC 스프라이트 생성기 (참고용): https://sanderfrenken.github.io/Universal-LPC-Spritesheet-Character-Generator/
- 파이프라인 디자인 영감: `data/agents/` 하위 기존 newsroom 에이전트 구조 (유사 패턴)

---

## 11. 🛠 예상 개발 순서

1. **스캐폴드 작성** (1일): 폴더 구조 + `package.json` + `config.yaml` + 프롬프트 파일들. 실제 호출은 아직 안 함.
2. **OpenAI 호출 + 파일 저장 루프** (1일): 프리셋 1장 생성 성공시키기. 잘 되는지 확인.
3. **프롬프트 튜닝** (2~3일): 스타일 일관성 나올 때까지 반복. 이 단계가 제일 오래 걸림.
4. **Phase A 배치 완료** (1일): 50장 돌려서 쓸만한 것 추리기.
5. **선택 UI** (2일): `/metaverse/profile` 또는 모달. DB 연결.
6. **Phase B (레이어드)** 로 전환 — 리스크 감수하고 시도.

---

진행 시점에 문의사항 있으면 에이전트 구조/프롬프트 조정 도와드립니다.
