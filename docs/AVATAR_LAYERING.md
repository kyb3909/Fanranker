# Avatar Layering — MVP 후 전환 가이드

**현재 (MVP)**: 한 캐릭터 = 통째 스프라이트 (몸+옷+머리 baked in). 7키트 = 7개의 독립 캐릭터.

**목표**: 레이어드 — 베이스(몸) + 키트(옷 오버레이) + 헤어(머리 오버레이) 합성. 옷·머리를 자유 조합 가능.

이 문서는 MVP 출시 후 레이어드로 전환할 때 따라갈 실행 가이드.

## 왜 PixelLab pro 로는 못 했나

PixelLab pro 는 매번 **whole character (몸+옷+머리) 를 새로 생성**. "옷만" 또는 "머리만" 투명 오버레이 출력을 못 만든다. 결과물이 매번 다른 사람이라 같은 베이스에 갈아 끼울 수 없다.

## 실행 가능한 세 가지 길

### Path 1 — LPC (Liberated Pixel Cup) ⭐ 추천

[LPC](https://lpc.opengameart.org/) 는 CC-BY-SA / CC0 라이센스의 픽셀 아트 스프라이트 라이브러리. **레이어드 시스템을 위해 처음부터 설계됨**.

- 표준화된 64×64 베이스 캐릭터 (모든 sprite 가 같은 skeleton 사용)
- 수백 종 의류·머리·장비 오버레이가 이미 만들어져 있음 — 모두 베이스와 픽셀 완벽 정렬 보장
- idle / walk / run / hurt / slash / thrust / shoot / spellcast 애니메이션 포함
- 웹 sprite generator: <https://sanderfrenken.github.io/Universal-LPC-Spritesheet-Character-Generator/>
  - 클릭으로 옷·머리 조합 → sprite sheet 다운로드
- 게임용 Phaser 통합 예제 다수

**장점**:
- 자산 비용 0 (CC 라이센스, 출처 명시만)
- 정렬 문제 없음 (모두 같은 skeleton 위에 그려짐)
- 옷·머리·장비 종류 풍부 (수십~수백 개)
- 새 콘텐츠 추가가 generator 로 즉시 가능

**단점**:
- 스타일이 RPG/JRPG 느낌 (현재 chibi 와 다름)
- 64×64 픽셀 (현재 208×208 보다 훨씬 작음 — 스케일업 필요)
- 베이스 캐릭터를 LPC 로 갈아엎어야 함

**언제 선택**: 빨리 풍부한 옷·머리 라이브러리가 필요할 때. 스타일 변경 감수 가능할 때.

### Path 2 — Aseprite 손그림 오버레이

기존 default-pro-xl chibi 베이스를 그대로 두고, 모든 키트·헤어를 **손그림 픽셀아트** 로 직접 제작. Aseprite 의 reference layer 기능 사용:

1. Aseprite 에서 default-pro-xl 의 모든 프레임을 reference layer (lock + 50% alpha) 로 깔기
2. 새 layer 위에 옷 픽셀만 정확히 그림 (베이스의 어깨·팔·다리 위치에 정렬)
3. 각 프레임 export → 투명 PNG (옷 픽셀만 있는 오버레이)

**프레임 수 (default-pro-xl 기준)**:
- rotations idle: 8 dir × 1 = 8 프레임
- walk: 8 dir × 4 frames = 32 프레임
- jump: 8 dir × 7 frames = 56 프레임 (실제 east+west 만 쓰면 14)
- kick: 2 dir × 4 frames = 8 프레임

→ 한 키트 풀세트 ≈ **62-104 프레임 손그림**. 픽셀아티스트 1명 기준 시간당 5-10 프레임이면 키트 1개에 **8-20 시간**.

**장점**: 현재 chibi 스타일 유지, 완전한 창의적 통제, PixelLab 비용 0

**단점**: 시간·인력 비용 큼. 7키트 + 8헤어 = 약 1,000 프레임 = 100-300 시간

**언제 선택**: 현재 캐릭터 스타일을 반드시 유지하고, 시간·예산이 있을 때

### Path 3 — Spine / DragonBones 스켈레탈

캐릭터를 본 + 스킨 메시로 rigging. 옷·머리를 본에 attach. 본이 움직이면 옷도 따라옴.

**장점**: 한 번 rigging 후 무한 옷 추가 매우 저렴, 부드러운 애니, modern 워크플로

**단점**: 픽셀아트 native 아님 (보간 결과가 픽셀스럽지 않음), 학습 곡선, runtime 라이브러리 추가, 도구 비용 (Spine pro 라이센스)

**언제 선택**: 프로젝트가 픽셀 미감 포기 가능 + 의상 종류가 매우 많아질 예정일 때

---

## 추천 진로

**옷·머리 라이브러리를 빨리 풍부하게 갖고 싶다면 → LPC**:
스타일 변경의 단점이 새 콘텐츠 무한 공급의 장점에 묻힘. 기존 default-pro-xl 캐릭터는 "레거시 옵션" 으로 남겨두고 새 LPC 베이스를 표준화.

**현재 chibi 룩을 무조건 지키고 싶다면 → Aseprite 손그림**:
phase rollout 으로 진행. 첫 달엔 키트 1개만 + 헤어 1개. 검증 후 확장.

## 엔진 리팩터 (어느 길이든 공통)

자산 접근법은 다르지만 Phaser 코드는 동일.

### 디렉토리 구조

```
public/avatars/
  base/
    rotations/     east.webp, west.webp, ... (8장)
    walk/east/     frame_0..3.webp
    walk/west/     frame_0..3.webp
    jump/east/     frame_0..6.webp
    kick/east/     frame_0..3.webp
  kits/
    arsenal-home/
      rotations/   east.webp ... (옷 픽셀만, 나머지 투명)
      walk/east/   frame_0..3.webp
      walk/west/   frame_0..3.webp
      jump/east/   frame_0..6.webp
      kick/east/   frame_0..3.webp
    chelsea-home/
      ... (동일 구조)
  hairs/
    afro/
      rotations/   east.webp (머리 픽셀만)
      walk/east/   frame_0..3.webp
      ...
```

각 키트·헤어는 베이스와 **동일한 프레임 수 + 동일한 캔버스 크기 + 동일한 프레임별 포즈**. 다른 점은 픽셀 위치만 (옷은 몸통·다리에, 머리는 두상에).

### LayeredAvatar GameObject

`lib/metaverse/avatar/layered-avatar.ts`:

```ts
import * as Phaser from "phaser"

interface LayeredAvatarConfig {
  scene: Phaser.Scene
  x: number
  y: number
  baseKey: string         // 'avatar-base'
  kitKey: string | null   // 'kit-arsenal-home' or null (탈의)
  hairKey: string | null  // 'hair-afro' or null (대머리)
}

export class LayeredAvatar extends Phaser.GameObjects.Container {
  base: Phaser.GameObjects.Sprite
  kit: Phaser.GameObjects.Sprite | null
  hair: Phaser.GameObjects.Sprite | null

  // 현재 재생 중인 anim — 레이어 sync 용
  private currentAnimKey: string | null = null
  private currentDir: string = "east"

  constructor(cfg: LayeredAvatarConfig) {
    super(cfg.scene, cfg.x, cfg.y)

    this.base = cfg.scene.add.sprite(0, 0, `${cfg.baseKey}-idle-east`)
    this.add(this.base)

    if (cfg.kitKey) {
      this.kit = cfg.scene.add.sprite(0, 0, `${cfg.kitKey}-idle-east`)
      this.add(this.kit)
    }

    if (cfg.hairKey) {
      this.hair = cfg.scene.add.sprite(0, 0, `${cfg.hairKey}-idle-east`)
      this.add(this.hair)
    }

    cfg.scene.add.existing(this)
    cfg.scene.physics.add.existing(this) // 물리 바디는 컨테이너에
  }

  /** 레이어 sync 재생 — base.play 와 동시에 kit/hair 도 같은 프레임으로 */
  playAnim(action: "idle" | "walk" | "jump" | "kick", dir: string) {
    this.currentAnimKey = action
    this.currentDir = dir
    const animBase = `${action}-${dir}`
    this.base.play(`base-${animBase}`, true)
    this.kit?.play(`kit-${this.kit.texture.key.split("-")[1]}-${animBase}`, true)
    this.hair?.play(`hair-${this.hair.texture.key.split("-")[1]}-${animBase}`, true)
  }

  /** 옷 갈아입기 — 캐릭터 위치 유지하고 sprite 만 교체 */
  changeKit(kitKey: string | null) {
    this.kit?.destroy()
    if (kitKey) {
      this.kit = this.scene.add.sprite(0, 0, `${kitKey}-idle-east`)
      this.add(this.kit)
      // 현재 anim 으로 즉시 sync
      if (this.currentAnimKey) this.playAnim(this.currentAnimKey as never, this.currentDir)
    } else {
      this.kit = null
    }
  }

  changeHair(hairKey: string | null) {
    /* changeKit 과 동일 패턴 */
  }
}
```

### 텍스처 로드 컨벤션

베이스·각 키트·각 헤어가 모두 동일한 프레임 인덱스를 공유하므로, 로드 코드는 layer 별 prefix 만 다르고 패턴 동일:

```ts
// 베이스
scene.load.image("base-idle-east", "/avatars/base/rotations/east.webp")
scene.load.spritesheet("base-walk-east", "/avatars/base/walk/east-strip.webp", {
  frameWidth: 208,
  frameHeight: 208,
})

// 키트 (베이스와 같은 prefix 패턴, kits/ 하위)
scene.load.image("kit-arsenal-home-idle-east", "/avatars/kits/arsenal-home/rotations/east.webp")
scene.load.spritesheet("kit-arsenal-home-walk-east", "/avatars/kits/arsenal-home/walk/east-strip.webp", {
  frameWidth: 208,
  frameHeight: 208,
})
```

각 layer 의 anim 등록도 prefix 만 다르고 동일.

### 마이그레이션 단계 (LPC 기준)

1. **LPC 베이스 채택** — Universal-LPC-Spritesheet-Character-Generator 에서 naked male/female base 다운로드
2. **default-pro-xl 와 LPC 베이스 병행 운영** — 기존 sprite 는 "레거시 chibi" 옵션으로, 새 LPC 베이스가 표준
3. **자산 디렉토리 재구성** — `public/metaverse/avatars/` → `public/avatars/{base,kits,hairs}/...`
4. **`pro-avatar-xl.ts` 분해** — 베이스 로드만 담당. 키트·헤어 로더는 별도 파일 (`kit-loader.ts`, `hair-loader.ts`)
5. **`presets.ts` 폐기** — 단일 캐릭터 기준 hitbox 만 정의 (키트는 hitbox 무관, 헤어도 무관)
6. **`LayeredAvatar` 도입** — 기존 `physics.add.sprite` 를 `new LayeredAvatar({...})` 로 교체. world-map-scene + side-scroller-scene 양쪽
7. **상점 UI 재구성** — kit / hair 분리 탭. 사용자가 (kitKey, hairKey) 짝 선택
8. **DB 스키마 확장** — `user_avatar_loadout.kit_key` + `user_avatar_loadout.hair_key` 두 컬럼
9. **API 확장** — `/api/metaverse/avatar/me` 응답에 `{ kitKey, hairKey }` 추가, `equip` API 가 둘 다 받음
10. **MVP 자산 자동 변환** — 기존 7개 통짜 캐릭터 (Chelsea·Tottenham 등) 를 "별개 LPC + 키트" 조합으로 매핑하거나, "레거시 chibi 캐릭터 셀렉트" 로 분리 보존

## MVP → 레이어드 데이터 마이그레이션

기존 `equipped_avatar_key` 가 "통짜 캐릭터" 기준이라 (예: `arsenal-home`), 레이어드 전환 시 마이그레이션 필요:

```sql
-- 기존: avatar_key 단일 컬럼
ALTER TABLE user_avatar_loadout
  ADD COLUMN kit_key TEXT,
  ADD COLUMN hair_key TEXT;

-- 매핑: 통짜 키 → (베이스, 키트, 헤어) 분해
UPDATE user_avatar_loadout SET
  kit_key = CASE equipped_avatar_key
    WHEN 'arsenal-home' THEN 'arsenal-home'
    WHEN 'chelsea-home' THEN 'chelsea-home'
    -- ...
    ELSE NULL
  END,
  hair_key = NULL; -- 기존 통짜는 헤어 없음 (대머리)

-- 옵션: equipped_avatar_key 컬럼 deprecate (하위 호환 위해 잠시 유지)
```

## 비용 추산

| 길 | 자산 비용 | 엔진 비용 | 진입 시간 |
|---|---|---|---|
| LPC | $0 (CC 라이센스) | 1-2일 (디렉토리·LayeredAvatar·로더) | **2-3일** |
| Aseprite 손그림 | 픽셀아티스트 100-300시간 | 동일 1-2일 | **수 주 ~ 수 개월** |
| Spine | 도구 라이센스 + rigger 시간 | 1주 (Spine runtime 통합) | 수 주 |

---

## 참고 자료

- [LPC 스프라이트 모음](https://opengameart.org/lpc)
- [Universal LPC Generator (브라우저 툴)](https://sanderfrenken.github.io/Universal-LPC-Spritesheet-Character-Generator/)
- [Aseprite reference layer 사용법](https://www.aseprite.org/docs/reference-layer/)
- [Phaser Container 가이드](https://phaser.io/examples/v3/category/game-objects/container)
- [Phaser arcade body + Container 주의점](https://phaser.io/examples/v3.85.0/physics/arcade/view/group-vs-group)
