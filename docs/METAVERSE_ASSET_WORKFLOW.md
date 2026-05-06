# 메타버스 에셋 제작 매뉴얼

영국 월드맵(탑다운) + 경기장 사이드 스크롤(하이버리·클럭엔드) + 옷 갈아입히는 아바타 — 이 셋을 한 워크플로우로 만들기 위한 작업 가이드.

> **이 문서를 어떻게 읽는가**
>
> - **처음**: Part 0 (큰 그림)을 먼저 읽고, Part 1 (도구 준비)에서 라이센스·설치를 끝낸다
> - **아바타만 작업할 때**: Part 2 + Part 4.1, 4.2
> - **월드맵만 작업할 때**: Part 3 + Part 4.3, 4.4
> - **막혔을 때**: Part 5 (트러블슈팅) + 부록
> - **처음 한 번 손에 익히기**: Part 6 (첫 사이클 미니 과제)

---

## Part 0. 큰 그림

### 0.1 전체 워크플로우 다이어그램

```
┌─────────────────────────────────────────────────────────────────────┐
│                        에셋 (사용자 작업)                              │
│                                                                     │
│  ┌─ 아바타 ─────────────────┐  ┌─ 월드맵 ──────────────────┐         │
│  │ Seliel Base (구매)        │  │ LimeZu Tilesets (구매)    │         │
│  │   ↓                       │  │   ↓                       │         │
│  │ Aseprite                  │  │ Tiled (맵 에디터)          │         │
│  │  - reference layer로 base │  │  - 영국 전지도 그리기       │         │
│  │  - shirt/hair 레이어 그림  │  │  - 도시/광장/스타디움 배치  │         │
│  │  - 레이어별 PNG export    │  │  - 충돌 영역 표시           │         │
│  └────────────┬──────────────┘  └────────────┬──────────────┘         │
│               │                                │                     │
│               ▼                                ▼                     │
│         shirt-home.png …               england-london.json (Tiled)   │
└─────────────────────────────────────────────────────────────────────┘
                │                                │
                ▼                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                  후처리 (Claude Code 자동화)                          │
│                                                                     │
│  • sharp 라이브러리로 색 변환 / 합성 미리보기 / WebP 최적화           │
│  • 디렉토리 정리 / 파일명 일관성 / 메타데이터 JSON 생성                │
│  • 베이스 + 옷 합성 preview.png → 사용자 검수                         │
└─────────────────────────────────────────────────────────────────────┘
                │                                │
                ▼                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Phaser 4 통합 (코드)                              │
│                                                                     │
│  • lib/metaverse/avatar/layered-avatar.ts   — Container 합성        │
│  • lib/metaverse/scenes/world-map-scene.ts  — Tilemap loader        │
│  • components/metaverse/outfit-picker.tsx   — 옷 셀렉트 UI          │
│  • avatar 데이터 모델 (profiles 또는 localStorage)                  │
└─────────────────────────────────────────────────────────────────────┘
```

### 0.2 도구 매트릭스

| 도구 | 용도 | 가격 | 대체재 |
|---|---|---|---|
| [Seliel Character Base](https://seliel-the-shaper.itch.io/character-base) | 사이드뷰 캐릭 베이스 sprite | ~$5~15 | 외주 (3~5배 비용) |
| [LimeZu Modern Interiors](https://limezu.itch.io/moderninteriors) | 탑다운 16×16 타일셋 | ~$30 | Cup Nooble (cute), Mana Seed (fantasy) — 톤 안 맞음 |
| [Aseprite](https://www.aseprite.org/) | 픽셀 그리기·레이어 작업 | $19.99 | [LibreSprite](https://libresprite.github.io/) (무료 fork) |
| [Tiled Map Editor](https://www.mapeditor.org/) | 타일맵 에디터 | **무료** | (대체재 거의 없음. 사실상 표준) |
| Claude Code (이 환경) | 후처리·자동화 | 이미 사용 중 | — |
| sharp (이미 설치) | 이미지 합성·변환 | 이미 설치 | — |

**총 도구 비용**: 약 $55~65 (Tiled, Claude Code, sharp는 무료/이미 있음).

### 0.3 사용자 / Claude Code 역할 분담

| 작업 | 누가 |
|---|---|
| **창의적 픽셀 작업** (옷 디자인, 한 픽셀 단위 polish) | 사용자 (Aseprite) |
| **맵 디자인** (어디에 도시·스타디움을 둘지) | 사용자 (Tiled) |
| **반복적 색 변환** (홈 → 어웨이 색 swap) | Claude Code (sharp) |
| **합성 미리보기** (베이스 + 옷이 어떻게 보이는지) | Claude Code |
| **파일 정리·이름 일관성** | Claude Code |
| **WebP 변환·최적화** | Claude Code |
| **Phaser 코드 통합** | Claude Code |
| **검수·승인** (이게 잘 됐는지 확인) | 사용자 |

원칙: **사용자는 창의적 결정에만 집중. 반복 작업은 Claude Code.**

---

## Part 1. 도구 준비

### 1.1 라이센스 구매 순서

가장 작은 비용·결정 비용 적은 것부터:

1. **Aseprite ($19.99)** — Steam 또는 itch에서. 본인 PC 1대 라이센스
2. **Seliel Character Base (~$5~15)** — itch.io
3. **LimeZu Modern Interiors (~$30)** — itch.io (full bundle 또는 starter)
4. **Tiled** — `mapeditor.org`에서 무료 다운로드

각 사이트 결제 시 **이메일 영수증을 안전한 곳에 보관**. 라이센스 키나 다운로드 링크가 시간이 지나도 유효해야 함.

### 1.2 라이센스 보관 방법

```
~/Documents/licenses/
├── aseprite-receipt.pdf
├── seliel-character-base-receipt.pdf
├── seliel-license-key.txt
├── limezu-modern-interiors-receipt.pdf
└── README.md  (어디서 구매했는지·라이센스 범위 메모)
```

**절대 repo 안에 커밋하지 말 것.** `.gitignore`에 이미 처리되어 있지만 주의.

### 1.3 라이센스 사용 범위 (각 도구)

| 도구 | 사용 범위 |
|---|---|
| Aseprite | 본인 PC 1대. 작업 결과물의 상업 이용 제한 없음 |
| Seliel | **단일 상업 프로젝트** (gongnori.fan). 다른 프로젝트 시작 시 재구매 |
| LimeZu | **단일 상업 프로젝트** (gongnori.fan). 동일 |
| Tiled | 무료 오픈소스 (GPL). 자유 사용 |

**중요**: gongnori.fan을 운영 중인 동안엔 모두 commercial use OK. 별도 게임이나 신 서비스를 시작하면 라이센스 재확인.

### 1.4 설치 확인

설치 후 다음 명령으로 검증 (PowerShell):

```powershell
# Aseprite
& "C:\Program Files\Aseprite\Aseprite.exe" --version

# Tiled
& "C:\Program Files\Tiled\tiled.exe" --version
```

또는 그냥 각 앱을 한 번 실행해서 정상 부팅되는지 확인.

---

## Part 2. 아바타 워크플로우 (사이드 스크롤)

### 2.1 Seliel 베이스 구조 점검

구매 후 ZIP 압축 해제. 실제 폴더 구조는 작가 버전에 따라 다를 수 있지만 대략:

```
character-base/
├── walk/
│   ├── walk_east_0.png
│   ├── walk_east_1.png
│   ├── walk_east_2.png
│   ├── walk_east_3.png
│   ├── walk_west_0.png
│   ├── ...
├── idle/
│   ├── idle_east.png
│   └── idle_west.png
├── jump/   (포함 시)
├── README.txt
└── LICENSE.txt
```

**확인할 4가지 정보** — 이걸 모은 다음 Claude Code에 넘겨주면 코드 골격이 만들어짐:

| 항목 | 예시 값 | 어디서 확인 |
|---|---|---|
| frameWidth (가로 픽셀) | 64 | PNG 한 장의 width |
| frameHeight (세로 픽셀) | 64 | PNG 한 장의 height |
| walkFrames (walk 프레임 수) | 4 | walk_east_X.png의 X 최댓값 + 1 |
| jump 포함 여부 | true / false | jump 폴더 존재 여부 |

PowerShell로 빠르게 확인:

```powershell
# 첫 PNG의 사이즈 확인
$img = [System.Drawing.Image]::FromFile("C:\path\to\walk_east_0.png")
"$($img.Width) x $($img.Height)"
$img.Dispose()
```

또는 Aseprite로 PNG 한 장 열고 상태바에서 사이즈 확인 (가장 간단).

### 2.2 Aseprite 화면 구성

처음 열면 어디가 뭔지 헷갈리니 한 번 짚고 가기:

```
┌────────────────────────────────────────────────────────────────┐
│  메뉴 (File / Edit / View / Sprite / Layer / Frame …)          │
├──────┬─────────────────────────────────────────────────┬──────┤
│  도  │                                                  │  색  │
│  구  │                                                  │  팔  │
│  바  │           캔버스 (그림 그리는 영역)                │  레  │
│      │                                                  │  트  │
│  B   │                                                  │      │
│  M   │                                                  │ ████ │
│  G   │                                                  │ ████ │
│  I   │                                                  │      │
│  ...  │                                                  │      │
├──────┴─────────────────────────────────────────────────┼──────┤
│  Frames: [1] [2] [3] [4]  ← 클릭하면 그 프레임으로 이동  │  레  │
│                                                          │  이  │
│                                                          │  어  │
│                                                          │      │
│                                                          │ ☑hair│
│                                                          │ ☑shirt│
│                                                          │ 🔒base│
└──────────────────────────────────────────────────────────┴──────┘
```

**왼쪽 = 도구바**, **오른쪽 위 = 색**, **오른쪽 아래 = 레이어**, **하단 가운데 = 프레임 타임라인**, **가운데 = 캔버스**.

### 2.3 핵심 단축키 (외워두면 작업 속도 3배)

| 키 | 동작 |
|---|---|
| `B` | Brush — 픽셀 그리기 |
| `E` | Eraser — 지우기 |
| `M` | Marquee — 사각 영역 선택 |
| `G` | Bucket — 영역 채우기 |
| `I` | Eyedropper — 색 찍기 (Alt+클릭으로도 가능) |
| `F3` | **Onion skin 토글** ← 매우 자주 씀 |
| `Tab` | UI 숨기기 (집중 모드) |
| `Ctrl+Z` / `Ctrl+Y` | Undo / Redo |
| `Ctrl+A` | 모든 픽셀 선택 |
| `Ctrl+Shift+A` | 모든 frame 선택 |
| `[` / `]` | 브러시 사이즈 |
| `Alt+클릭` | 그 픽셀 색을 현재 색으로 |
| `Space+드래그` | 캔버스 패닝 |
| `Ctrl+휠` | 줌 인/아웃 |

### 2.4 Reference Layer로 베이스 깔기 — 핵심 개념

**원칙**: 베이스에는 손을 안 댄다. 베이스는 **참조용으로 깔고 잠근다**. 그 위에 옷 레이어를 그린다.

#### 2.4.1 새 파일 생성

1. `File > New`
2. **Width × Height**: Seliel 베이스와 동일 (예: 64×64)
3. **Color Mode**: RGB Color
4. **Background**: Transparent
5. OK

#### 2.4.2 Walk 시퀀스 import

1. `File > Import Sprite Sheet` (또는 `File > Import > Frames as Animation`)
2. Seliel의 `walk/walk_east_0.png` ~ `walk_east_3.png` 4장 선택
3. 각 PNG가 frame 1, 2, 3, 4로 자동 들어감
4. 캔버스 하단 Frames 타임라인에 4프레임이 보임

#### 2.4.3 베이스 레이어를 Reference로 잠그기

1. 오른쪽 Layers 패널 → 베이스 레이어 우클릭
2. `Layer Properties` 또는 `Convert to Reference Layer`
3. **잠금 (Lock 아이콘 클릭)** → 실수로 수정 불가

이제 베이스는 화면에 살짝 흐리게 비춰지면서 잠긴 상태. 그 위에 새 레이어를 만들어서 그릴 준비 완료.

### 2.5 옷 레이어 추가 + 한 벌 그리기

#### 2.5.1 새 레이어 추가

1. Layers 패널 → 좌측 상단 `+` 아이콘 → `New Layer`
2. 이름: `shirt`
3. **베이스 레이어보다 위에 위치 확인** (위 = 화면 앞쪽)

레이어 z-order:

```
☑ accessory   ← 가장 위에 보임
☑ hair
☑ shirt       ← 지금 작업
☑ pants       (선택)
🔒 base        ← reference, 잠김
```

#### 2.5.2 첫 프레임에 셔츠 그리기

1. **Frame 1** 선택 (타임라인에서 클릭)
2. **shirt 레이어** 활성화 확인 (Layers 패널에서 클릭)
3. 색상 패널에서 빨강 선택 (예: `#EF0107` 아스날 홈)
4. `B` (Brush) → 베이스 캐릭 몸통 위에 셔츠 모양 픽셀 그리기

베이스가 reference로 비치니까 어디에 그려야 할지 한눈에 보임.

#### 2.5.3 Onion Skin으로 다음 프레임 그리기

`F3` 눌러 onion skin 켜기 → 이전 프레임이 흐릿하게 비침.

1. Frame 2 선택
2. shirt 레이어에서 작업
3. Frame 1의 셔츠 위치를 기준으로, 베이스의 자세 변화 (다리/팔 움직임)에 맞춰 셔츠 픽셀을 1~2픽셀 보정
4. Frame 3, 4도 동일

**팁**: Frame 1의 셔츠를 복사 (`Ctrl+A` → `Ctrl+C`) → Frame 2에서 붙여넣기 → 1~2픽셀 보정. 매번 처음부터 그리지 말 것.

#### 2.5.4 East 끝나면 West 만들기

대부분의 옷은 좌우 대칭이라 단순 flip:

1. Frame 1~4 모두 선택 (`Ctrl+Shift+A`)
2. shirt 레이어만 표시되어 있는지 확인 (다른 레이어 visibility 끄기)
3. `Sprite > Flip Horizontal` (또는 `Ctrl+Shift+H`)
4. 결과를 새 파일에 복사 또는 새 frame range로 export

비대칭 옷(가슴 로고가 한쪽에만)은 flip 후 손으로 보정.

### 2.6 레이어별 Export

#### 2.6.1 옷만 단독 export (베이스 빼고)

1. Layers 패널에서 **base 레이어 visibility 끄기** (눈 아이콘 클릭)
2. `File > Export Sprite Sheet`
3. 옵션:
   - **Layout**: `Horizontal Strip`
   - **Sprite**: `Selected Layers` → `shirt`만 체크
   - **Output**:
     - `PNG file`: `shirt-arsenal-home.png`
     - `JSON Data`: `shirt-arsenal-home.json` (Phaser용)
   - **Item Filename**: `walk_east_{frame}` 또는 빈 칸 (sprite sheet packed로 가면 자동)
4. Export

→ **shirt 레이어만 들어 있는 PNG + JSON 메타데이터** 생성.

#### 2.6.2 통합 미리보기 export (검수용)

base + shirt 함께:

1. base 레이어 visibility 다시 켜기
2. 동일 export 절차
3. 파일명: `preview-arsenal-home.png`

→ 옷이 자세에 맞춰 자연스럽게 움직이는지 한눈에 볼 수 있음.

#### 2.6.3 자동 export 설정 (반복 작업 줄이기)

`File > Export As`로 한 번 export 옵션 세팅하면, 다음부터는 `Ctrl+F` (Repeat last export)로 한 번에. 옷 N벌 양산 시 매우 유용.

### 2.7 Claude Code 후처리

repo의 `public/metaverse/avatars/seliel-base/clothing/` 폴더에 PNG 던지고 Claude Code에 요청:

#### 2.7.1 색 변환 (홈 → 어웨이)

```
사용자: shirt-arsenal-home.png를 노랑(#FFD700)/검정 어웨이로 변환해서
       shirt-arsenal-away.png로 저장해줘. 빨강(#EF0107)만 노랑으로.
```

Claude는 sharp 스크립트 작성:

```ts
import sharp from "sharp"

await sharp("shirt-arsenal-home.png")
  .raw()
  .toBuffer({ resolveWithObject: true })
  .then(({ data, info }) => {
    // 빨강 픽셀을 노랑으로 swap (RGB tolerance 적용)
    for (let i = 0; i < data.length; i += info.channels) {
      const [r, g, b] = [data[i], data[i + 1], data[i + 2]]
      if (r > 200 && g < 50 && b < 50) {
        data[i] = 255      // R
        data[i + 1] = 215  // G
        data[i + 2] = 0    // B
      }
    }
    return sharp(data, {
      raw: { width: info.width, height: info.height, channels: info.channels },
    }).toFile("shirt-arsenal-away.png")
  })
```

자동 색 변환은 미세하게 어색할 수 있음 → 사용자가 Aseprite에서 마지막 polish.

#### 2.7.2 베이스 + 옷 합성 미리보기

```
사용자: shirt-arsenal-home.png를 Seliel 베이스 walk_east 시퀀스에
       합성해서 preview.png로 만들어줘.
```

Claude는 sharp.composite 사용:

```ts
await sharp("seliel-walk-east.png")
  .composite([{ input: "shirt-arsenal-home.png", left: 0, top: 0 }])
  .toFile("preview-arsenal-home.png")
```

#### 2.7.3 WebP 변환 일괄

```
사용자: public/metaverse/avatars/seliel-base/ 안의 모든 PNG를 WebP로
       변환해줘 (quality 85). 원본 PNG는 그대로 둬.
```

50~80% 파일 크기 절약. LCP·모바일 데이터 사용량에 좋음.

#### 2.7.4 Sprite sheet packing (Aseprite export로 이미 처리됐으면 생략)

여러 개별 frame PNG를 한 sheet으로:

```
사용자: walk_east_0~3.png를 horizontal strip 한 장으로 합치고
       Phaser 호환 JSON 메타데이터 만들어줘.
```

### 2.8 옷 추가 (어웨이/서드 양산)

홈 셔츠가 완성되어 있으면 추가 옷은 빠름:

1. Aseprite에서 `shirt-arsenal-home.aseprite` 복제 → `shirt-arsenal-away.aseprite`
2. shirt 레이어 색상만 변경
   - `Edit > Replace Color`로 빨강 → 노랑 일괄 변환
   - 또는 Claude Code에 색 변환 요청 (위 2.7.1)
3. Export → `shirt-arsenal-away.png`
4. 코드의 `SHIRT_OPTIONS` 배열에 한 줄 추가

작가가 그린 디테일(주름, 그림자)은 그대로 유지되면서 색만 바뀜.

### 2.9 머리·액세서리 확장

같은 패턴으로 레이어를 늘림:

1. Aseprite에서 새 파일 → reference layer로 베이스 깔기
2. `hair` 레이어에 머리만 그림 (몸/얼굴은 손 안 댐)
3. Export → `hair-short-brown.png`
4. `outfit.hairKey` 옵션에 추가
5. Phaser Container에 hair sprite를 z-order 위쪽에 add

심즈식 자유 조합:

```ts
const outfit = {
  shirtKey: "shirt-arsenal-home",
  hairKey: "hair-short-brown",
  accessoryKey: "glasses-round",
}
```

---

## Part 3. 월드맵 워크플로우 (탑다운)

### 3.1 Aseprite로 맵을 만들 수 있나?

**가능은 하지만 작은 맵 한정.** Aseprite 1.3부터 Tilemap 모드가 추가되어서 단일 화면 정도의 맵은 만들 수 있어요.

**근데 영국 전지도 같은 큰 맵에는 부적합한 이유:**

| | Aseprite Tilemap | Tiled |
|---|---|---|
| **여러 레이어** (배경/충돌/오브젝트) | 가능하지만 불편 | 본질적으로 지원 |
| **Object layer** (스타디움 입구 같은 트리거) | ❌ 없음 | ✅ 있음 |
| **충돌 영역 표시** | 수동 | ✅ 전용 도구 |
| **타일셋 import** (.tsx 형식) | 변환 필요 | ✅ 직접 |
| **Phaser 호환 JSON export** | PNG 통짜만 | ✅ 직접 |
| **큰 맵 성능** (4000×3000 등) | 무거워짐 | 가벼움 |
| **장점** | 픽셀 단위로 타일 자체 그리기 편함 | 맵 디자인에 특화 |

**결론**: 맵은 Tiled, 타일 자체 추가/수정은 Aseprite. 두 도구의 역할이 다름:

```
Tiled  = 레고 블록을 어디에 놓을지
Aseprite = 새 레고 블록 직접 만들기
```

### 3.2 Tiled 설치 + 첫 인상

1. [mapeditor.org](https://www.mapeditor.org/) → Download
2. 설치 후 실행

```
┌────────────────────────────────────────────────────────────────┐
│  메뉴                                                            │
├──────┬─────────────────────────────────────────────────┬──────┤
│      │                                                  │  레  │
│  타  │                                                  │  이  │
│  일  │           맵 캔버스 (영국 지도)                    │  어  │
│  셋  │                                                  │      │
│      │                                                  │ obj  │
│ ▦▦▦ │                                                  │ col  │
│ ▦▦▦ │                                                  │ deco │
│ ▦▦▦ │                                                  │ bg   │
│      │                                                  │      │
├──────┴─────────────────────────────────────────────────┴──────┤
│  속성 / 미니맵 / 콘솔                                           │
└────────────────────────────────────────────────────────────────┘
```

**왼쪽 = 타일셋 (LimeZu 타일들)**, **오른쪽 = 레이어**, **가운데 = 맵 캔버스**, **하단 = 보조 정보**.

### 3.3 LimeZu 타일셋 가져오기

#### 3.3.1 LimeZu가 주는 것

LimeZu Modern Interiors ZIP을 풀면 대략:

```
ModernInteriors/
├── 16x16/
│   ├── Interiors_16x16.png        (전체 인테리어 타일셋)
│   ├── Room_Builder_16x16.png     (방 만들기용 벽·바닥)
│   ├── Characters_16x16/          (캐릭터 generator 베이스)
│   └── ...
├── 32x32/
└── README.txt
```

**핵심**: `Interiors_16x16.png` 같은 큰 PNG가 타일셋. 이 안에 수백~수천 개 타일이 16×16 그리드로 배치되어 있음.

#### 3.3.2 Tiled에 import

1. Tiled 실행 → `File > New > New Map`
2. Map 설정:
   - **Orientation**: Orthogonal (탑다운)
   - **Tile size**: 16×16 (LimeZu 표준)
   - **Map size**: 일단 100×80 정도 (1600×1280 픽셀, 영국 1/2 크기 정도)
   - **Tile layer format**: CSV
3. `File > Save As` → `public/map/uk-london.tmx` (Tiled 네이티브 형식)
4. 우측 Tilesets 패널 → `New Tileset`
5. 옵션:
   - **Type**: Based on Tileset Image
   - **Image**: `Interiors_16x16.png` 선택
   - **Tile size**: 16×16
   - **Embed in map**: 체크 해제 (나중에 다른 맵에서도 재사용 가능하게)
6. 저장 → `.tsx` 파일 별도 생성 (예: `interiors-16x16.tsx`)

### 3.4 Tiled 핵심 단축키

| 키 | 동작 |
|---|---|
| `B` | Stamp Brush — 타일 찍기 |
| `R` | Rectangle Fill |
| `G` | Bucket Fill |
| `Z` | Random fill (자연스러운 풀밭/도로 등) |
| `E` | Eraser |
| `S` | Selection |
| `T` | Terrain Brush (자동 연결) |
| `Ctrl+Z` / `Ctrl+Y` | Undo / Redo |
| `Space+드래그` | 패닝 |
| `Ctrl+휠` | 줌 |
| `Ctrl+S` | 저장 |

### 3.5 영국 전지도 캔버스 세팅

> **결정 포인트**: 영국 모양을 사실적으로 그리지 말 것. **Pokemon 스타일로 풍자적**으로. 픽셀아트로 사실적 영국 그리면 너무 크고 정보 전달 안 됨.

#### 3.5.1 캔버스 사이즈 결정

권장: **80×60 타일 (1280×960 픽셀)** — 한 화면 보기 좋고, 캐릭이 한참 걸어다녀야 할 정도

대안:
- 작게: 50×40 (모바일 친화, 빠른 이동)
- 크게: 120×90 (탐험감 더, 무거움)

`Map > Resize Map`으로 나중에 변경 가능.

#### 3.5.2 화면 비율

탑다운 메타버스는 4:3 또는 16:9 비율 자유. 캐릭이 카메라 follow하니까 맵 자체 비율은 게임플레이에 영향 적음.

### 3.6 레이어 구성 (표준 4단)

오른쪽 Layers 패널 → `+` → `Tile Layer` 또는 `Object Layer`.

```
┌─────────────────────────────────┐
│ ☑ object  (Object Layer)         │ ← 스타디움 입구, NPC, 트리거 (sprite)
├─────────────────────────────────┤
│ ☑ collision  (Tile Layer)        │ ← 충돌 영역만 (벽·바다)
├─────────────────────────────────┤
│ ☑ decoration  (Tile Layer)       │ ← 나무, 표지판, 깃발, 꽃
├─────────────────────────────────┤
│ ☑ background  (Tile Layer)       │ ← 잔디, 도로, 강, 해변
└─────────────────────────────────┘
```

**위에서 아래로 = 화면 z-order의 위쪽**. background를 가장 아래에 두는 이유.

### 3.7 타일 그리기 (background)

1. background 레이어 선택
2. 타일셋에서 잔디 타일 선택
3. `G` (Bucket) → 캔버스 클릭 → 모두 잔디로 채움
4. 강·해변 타일 선택 → `B` (Stamp) 또는 `R` (Rectangle) → 그리기

**팁**:
- `Z` (Random fill)로 잔디 변형 여러 종 섞으면 자연스러움
- `T` (Terrain Brush)로 잔디 ↔ 도로 자동 연결 (가장자리 타일이 자동 적용됨)

### 3.8 도시·광장 (decoration 레이어)

1. decoration 레이어 선택
2. 런던 위치에 광장 타일 (벽돌·분수 등)
3. 표지판 타일로 도시 이름 표시
4. 나무·가로등 등 디테일

### 3.9 충돌 영역 (collision 레이어)

#### 방식 A — 단색 타일로 표시 (간단)

1. collision 레이어 선택
2. 빈 타일셋에서 단색 빨강 타일 (또는 임의 표시 타일) 선택
3. 캐릭이 못 가는 곳 (바다·강·벽)에 모두 빨강 타일 배치
4. 게임 코드에서 collision 레이어를 invisible 처리하고 충돌 판정으로만 사용

#### 방식 B — Tile Properties 사용 (정교)

1. 타일셋에서 충돌 타일 선택 → 우클릭 → `Tile Properties`
2. `Custom Property` 추가: `collides: true`
3. 게임 코드에서 이 property 보고 충돌 판정

A가 빠르고 직관적, B가 깔끔. 처음엔 A 권장.

### 3.10 오브젝트 (Object Layer)

스타디움 입구, NPC, 트리거 등은 **Object Layer**에 둠 (Tile Layer 아님).

1. `+` → `Object Layer` → 이름 `objects`
2. `R` (Insert Rectangle) → 런던에 사각형 그리기
3. 우측 Properties 패널:
   - **Name**: `highbury-entrance`
   - **Type**: `entrance` (또는 임의)
   - **Custom Property**:
     - `target_scene: "highbury"`
     - `label: "🏟️ 하이버리"`

이 정보가 JSON으로 export되면 Phaser 코드가 읽어서 클릭 가능한 sprite로 만듦.

### 3.11 Export — Phaser 호환 JSON

1. `File > Export As`
2. **포맷**: `JSON map files (*.json)`
3. 파일명: `uk-london.json`
4. 옵션:
   - **Resolve object types and properties**: 체크
   - **Embed tilesets**: 체크 해제 (큰 파일 됨)
   - **Output**: `public/map/uk-london.json`

→ Phaser tilemap loader가 그대로 읽을 수 있는 JSON 출력.

### 3.12 Aseprite로 부분 보정

Tiled에서 작업하다 "이런 타일이 있으면 좋겠다" 싶으면:

1. Aseprite에서 16×16 캔버스 새로 만들기
2. 픽셀로 직접 그리기 (LimeZu 톤에 맞춰)
3. PNG export
4. LimeZu 타일셋 PNG에 sharp로 추가하거나 별도 타일셋 PNG로 import

또는 Claude Code에 요청:

```
사용자: 16×16 픽셀로 빨간 우체통 타일 하나 그려줘. LimeZu Modern Interiors
       톤에 맞춰서.
```

(다만 Claude Code 자체는 픽셀아트를 처음부터 그리지 못함. PixelLab MCP 또는 사용자 본인이 그려야)

---

## Part 4. Phaser 통합

### 4.1 디렉토리 구조 (전체)

```
public/
├── metaverse/
│   ├── avatars/
│   │   └── seliel-base/
│   │       ├── base/
│   │       │   ├── walk-east.webp
│   │       │   ├── walk-west.webp
│   │       │   ├── idle-east.webp
│   │       │   ├── idle-west.webp
│   │       │   └── meta.json
│   │       ├── clothing/
│   │       │   ├── shirt-arsenal-home.webp
│   │       │   ├── shirt-arsenal-away.webp
│   │       │   ├── shirt-arsenal-third.webp
│   │       │   └── meta.json
│   │       ├── hair/
│   │       │   └── hair-short-brown.webp
│   │       └── accessory/
│   │           └── glasses-round.webp
│   └── maps/
│       ├── highbury.webp        (사이드 스크롤 외관 — 외주)
│       ├── clockend.webp        (사이드 스크롤 내부 — 외주)
│       └── (기타 경기장)
└── map/
    ├── uk-london.json           (Tiled export)
    ├── interiors-16x16.tsx      (LimeZu 타일셋 정의)
    └── tilesets/
        └── interiors-16x16.png  (LimeZu 타일셋 이미지)

lib/metaverse/
├── avatar/
│   ├── seliel-base.ts           (베이스 상수)
│   ├── layered-avatar.ts        (Container 합성 로직)
│   └── outfit.ts                (outfit 데이터 모델)
├── scenes/
│   ├── world-map-scene.ts       (Tilemap 사용)
│   └── indoor-map-scene.ts      (사이드 스크롤)
└── boot.ts
```

### 4.2 Layered Avatar (사이드 스크롤)

#### 4.2.1 베이스 상수

```ts
// lib/metaverse/avatar/seliel-base.ts
export const SELIEL_BASE = {
  texturePrefix: "seliel-base",
  assetBase: "/metaverse/avatars/seliel-base/base",
  frameWidth: 64,         // ← Seliel ZIP 확인 후 채움
  frameHeight: 64,        // ← Seliel ZIP 확인 후 채움
  walkFrames: 4,
  idleFrames: 1,
  jumpFrames: 8,          // 사용자가 직전에 jump 있다고 함. 정확한 수 확인 필요
  walkFps: 10,
  jumpFps: 12,
  bodyWidth: 30,          // 캐릭터 픽셀 hitbox
  bodyHeight: 50,
  bodyOffsetX: 17,
  bodyOffsetY: 14,
} as const
```

#### 4.2.2 Layered Container 생성

```ts
// lib/metaverse/avatar/layered-avatar.ts
import * as Phaser from "phaser"
import { SELIEL_BASE } from "./seliel-base"

export interface AvatarOutfit {
  shirtKey: string
  hairKey?: string
  accessoryKey?: string
}

export function preloadLayeredAvatar(scene: Phaser.Scene, outfit: AvatarOutfit) {
  const { frameWidth, frameHeight, assetBase } = SELIEL_BASE

  scene.load.spritesheet("seliel-base-walk-east", `${assetBase}/walk-east.webp`, {
    frameWidth,
    frameHeight,
  })
  scene.load.spritesheet("seliel-base-walk-west", `${assetBase}/walk-west.webp`, {
    frameWidth,
    frameHeight,
  })

  scene.load.spritesheet(outfit.shirtKey, `/metaverse/avatars/seliel-base/clothing/${outfit.shirtKey}.webp`, {
    frameWidth,
    frameHeight,
  })

  if (outfit.hairKey) {
    scene.load.spritesheet(outfit.hairKey, `/metaverse/avatars/seliel-base/hair/${outfit.hairKey}.webp`, {
      frameWidth,
      frameHeight,
    })
  }
}

export function createLayeredAnimations(scene: Phaser.Scene, outfit: AvatarOutfit) {
  const { walkFrames, walkFps } = SELIEL_BASE

  for (const dir of ["east", "west"] as const) {
    const baseKey = `seliel-base-walk-${dir}`
    if (!scene.anims.exists(`base-walk-${dir}`)) {
      scene.anims.create({
        key: `base-walk-${dir}`,
        frames: scene.anims.generateFrameNumbers(baseKey, { start: 0, end: walkFrames - 1 }),
        frameRate: walkFps,
        repeat: -1,
      })
    }
    if (!scene.anims.exists(`shirt-walk-${dir}`)) {
      scene.anims.create({
        key: `shirt-walk-${dir}`,
        frames: scene.anims.generateFrameNumbers(outfit.shirtKey, { start: 0, end: walkFrames - 1 }),
        frameRate: walkFps,
        repeat: -1,
      })
    }
  }
}

export function createLayeredAvatar(
  scene: Phaser.Scene,
  x: number,
  y: number,
  outfit: AvatarOutfit
): Phaser.GameObjects.Container {
  const container = scene.add.container(x, y)

  const base = scene.add.sprite(0, 0, "seliel-base-walk-east", 0)
  const shirt = scene.add.sprite(0, 0, outfit.shirtKey, 0)

  container.add([base, shirt])

  if (outfit.hairKey) {
    const hair = scene.add.sprite(0, 0, outfit.hairKey, 0)
    container.add(hair)
  }

  return container
}

export function playAvatarAnim(
  container: Phaser.GameObjects.Container,
  layerKeyPrefixes: string[],  // ["base", "shirt", "hair"]
  animSuffix: string            // "walk-east"
) {
  container.list.forEach((child, idx) => {
    if (child instanceof Phaser.GameObjects.Sprite) {
      const prefix = layerKeyPrefixes[idx]
      child.play(`${prefix}-${animSuffix}`, true)
    }
  })
}
```

#### 4.2.3 핵심 조건 (정렬 자동 보장 3조건)

1. 모든 레이어 sprite의 **frameWidth × frameHeight 동일** (= SELIEL_BASE 사이즈)
2. 모든 레이어의 **frame 개수 동일** (예: walk 4프레임)
3. 모든 레이어 anim의 **frame index 순서 동일** (Aseprite export 순서를 유지하면 자동)

이 셋이 맞으면 Phaser가 같은 frame index를 동시 재생 → 옷이 베이스 자세에 자동 맞춰짐.

### 4.3 Tilemap Loader (월드맵)

```ts
// lib/metaverse/scenes/world-map-scene.ts
preload() {
  this.load.image("interiors-16x16", "/map/tilesets/interiors-16x16.png")
  this.load.tilemapTiledJSON("uk-london", "/map/uk-london.json")
}

create() {
  const map = this.make.tilemap({ key: "uk-london" })
  const tileset = map.addTilesetImage("Interiors_16x16", "interiors-16x16")!

  const bgLayer = map.createLayer("background", tileset, 0, 0)!
  const decoLayer = map.createLayer("decoration", tileset, 0, 0)!
  const collLayer = map.createLayer("collision", tileset, 0, 0)!

  // 충돌 — collision 레이어의 모든 빨강 타일을 collision으로
  collLayer.setCollisionByExclusion([-1])  // -1 (빈 타일) 외 모두 충돌
  collLayer.setVisible(false)               // collision은 안 보이게

  // Object layer — 스타디움 입구 등
  const objects = map.getObjectLayer("objects")
  objects?.objects.forEach((obj) => {
    if (obj.type === "entrance") {
      this.createEntranceSprite(obj.x!, obj.y!, obj.properties)
    }
  })

  // 카메라 + 충돌 + 캐릭터 follow는 기존 코드 그대로
  this.physics.add.collider(this.player, collLayer)
  this.cameras.main.startFollow(this.player)
}
```

### 4.4 시점 전환 (월드맵 → 사이드 스크롤)

```ts
// 월드맵 씬에서
private createEntranceSprite(x: number, y: number, props: any) {
  const sprite = this.add.image(x, y, props.icon)
    .setInteractive({ useHandCursor: true })

  sprite.on("pointerdown", () => {
    sceneBridge.emit("highbury:enter")
    // → React 측이 router.push("/metaverse/highbury")
  })
}
```

이미 코드에 들어 있는 `drawHighburyEntrance` 패턴을 Tilemap object layer 기반으로 바꾸는 것.

### 4.5 옷 셀렉트 UI

```tsx
// components/metaverse/outfit-picker.tsx
"use client"
import { useState } from "react"

const SHIRT_OPTIONS = [
  { key: "shirt-arsenal-home", label: "홈 (빨강)" },
  { key: "shirt-arsenal-away", label: "어웨이 (노랑)" },
  { key: "shirt-arsenal-third", label: "서드" },
]

export function OutfitPicker({
  current,
  onChange,
}: {
  current: string
  onChange: (key: string) => void
}) {
  return (
    <div className="flex gap-2">
      {SHIRT_OPTIONS.map((opt) => (
        <button
          key={opt.key}
          onClick={() => onChange(opt.key)}
          className={current === opt.key ? "active" : ""}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
```

선택값을 `localStorage` 또는 `profiles.outfit_json` 컬럼에 저장.

---

## Part 5. 트러블슈팅

### 5.1 아바타

**옷이 베이스 자세에 안 맞음 / 따로 놂**
- 원인: 옷 sprite의 frame index가 베이스와 다름
- 해결: Aseprite export 시 frame 순서 (left-to-right) 확인. JSON 메타데이터에 `walk_east_0, _1, _2, _3`로 일관 명명

**옷 가장자리에 검정 outline / 아티팩트**
- 원인: anti-aliasing 활성, 또는 색 변환 시 알파 채널 손상
- 해결: Aseprite `Sprite > Color Mode: RGB` (또는 Indexed). anti-aliasing 끄기. WebP 변환은 quality 85 이상

**같은 캐릭이 east/west에서 미묘하게 달라 보임**
- 원인: 비대칭 옷을 단순 flip
- 해결: west를 east flip으로 만든 후 손 보정

**Phaser에서 옷이 베이스보다 뒤에 그려짐**
- 원인: Container `add` 순서 (먼저 add한 게 뒤)
- 해결: `container.add([base, shirt, hair])` — 항상 base 먼저, accessory 마지막

**한 옷에서 다른 옷으로 바꿨는데 anim이 안 따라옴**
- 원인: 새 sprite key의 anim이 등록되지 않음
- 해결: outfit 변경 시 `createLayeredAnimations`를 다시 호출. 또는 모든 옷의 anim을 미리 등록

### 5.2 월드맵

**Tiled JSON에서 타일셋이 안 보임**
- 원인: `Embed in map`이 꺼져 있는데 `.tsx` 파일이 같은 경로에 없음
- 해결: `.tsx` 파일을 JSON과 같은 폴더에 두기, 또는 import 시 경로 수정

**Phaser tilemap 로드는 됐는데 화면이 비어있음**
- 원인: `addTilesetImage`의 첫 인자(타일셋 이름)가 Tiled에서 지정한 이름과 안 맞음
- 해결: Tiled의 타일셋 이름 (예: `Interiors_16x16`)을 `addTilesetImage("Interiors_16x16", ...)` 첫 인자에 정확히

**충돌이 안 먹힘**
- 원인: `setCollisionByExclusion`에 빈 타일 ID(-1)만 제외했는데 collision 레이어에 다른 타일도 있음
- 해결: collision 레이어에는 충돌 타일만 두기. 또는 `setCollisionBetween(start, end)`로 명시

**큰 맵이 너무 무거움 (FPS 저하)**
- 원인: 모든 레이어가 동시에 렌더
- 해결: `tilemapLayer.setCullPadding(2, 2)` — 화면 밖 타일은 컬링

### 5.3 라이센스 / 작업

**작업 중 라이센스 영수증을 잃어버림**
- itch.io 계정으로 로그인 후 `Library > 구매한 항목`에서 다시 다운로드 가능
- Aseprite는 Steam이라면 Steam 계정에 영구 보관

**외주 작가에게 베이스 ZIP을 어떻게 전달?**
- 라이센스가 single project commercial이면 외주 작가도 같은 프로젝트 작업이라 OK
- ZIP 또는 PNG 묶음을 Google Drive · Dropbox 같은 비공개 링크로 전달
- repo에 절대 업로드 금지

---

## Part 6. 첫 1회 사이클 (미니 과제)

처음에는 머리로만 그리지 말고 **30분~1시간 안에 한 바퀴 돌려보기**. 작은 성공이 손에 잡혀야 다음 단계로 갈 수 있음.

### 6.1 아바타 사이클 (30분)

- [ ] Seliel Character Base 라이센스 구매
- [ ] Aseprite 라이센스 구매 (또는 LibreSprite 다운로드)
- [ ] Seliel ZIP 풀고 walk_east 4프레임의 사이즈·개수 확인
- [ ] **저(Claude Code)에게 그 사이즈 알려주기** → `seliel-base.ts` 골격 만들어드림
- [ ] Aseprite에서 reference layer로 베이스 깔기
- [ ] shirt 레이어에 단색 빨강 셔츠만 그리기 (4프레임)
- [ ] shirt 레이어만 PNG로 export → `shirt-test.png`
- [ ] Claude Code에 "이 셔츠를 베이스에 합성해서 미리보기 만들어줘" 요청
- [ ] 미리보기 PNG 보고 옷이 자세에 맞춰 자연스럽게 움직이는지 확인

이 사이클이 성공하면 layered 시스템이 진짜 작동함을 확신할 수 있음. 다음부터는 어웨이/서드/머리 추가가 같은 패턴 반복.

### 6.2 월드맵 사이클 (1시간)

- [ ] LimeZu Modern Interiors 라이센스 구매
- [ ] Tiled 무료 다운로드
- [ ] LimeZu ZIP 풀고 `Interiors_16x16.png` 위치 확인
- [ ] Tiled에서 새 맵 (50×40 정도) 생성
- [ ] LimeZu 타일셋 import
- [ ] background 레이어에 잔디 채우기
- [ ] decoration 레이어에 도로·나무 몇 개
- [ ] objects 레이어에 사각형 하나 (`name: highbury, target: highbury`)
- [ ] JSON으로 export → `public/map/test-map.json`
- [ ] **저에게 알려주기** → `world-map-scene.ts`에서 이 JSON을 로드하는 코드 짜드림
- [ ] 브라우저에서 확인

이 사이클이 성공하면 영국 전지도로 확장 가능.

### 6.3 두 사이클 합쳐 한 번

아바타 사이클 + 월드맵 사이클을 같은 날 1~2시간 안에 다 한 번 돌려보면, 전체 워크플로우가 머리로 이해되는 수준에서 손으로 할 수 있는 수준으로 넘어감.

---

## Part 7. 다음 단계 (Phaser 본격 통합)

미니 과제 둘 다 성공한 후:

1. **Seliel ZIP의 정확한 정보 → `seliel-base.ts` 골격** (Claude Code 작성)
2. **`layered-avatar.ts` 신규 작성** — Container 합성 + anim 동기화
3. **`HighburyStage` 리팩토링** — 게스트 identity 자체 생성 대신 월드맵에서 outfit 받아오기
4. **`world-map-scene.ts` 리팩토링** — `england-map.webp` + `drawHighburyEntrance` 폐기, Tilemap loader로 교체
5. **`OutfitPicker` 컴포넌트** — 옷 셀렉트 UI
6. **outfit 데이터 영속화** — `profiles.outfit_json` 컬럼 추가 (마이그레이션) 또는 localStorage

각 단계는 PR 단위로 분리. 작업 시 사용자는 검수만, 구현은 Claude Code.

---

## 부록 A. Aseprite 단축키 치트시트

| 분류 | 키 | 동작 |
|---|---|---|
| 도구 | `B` | Brush |
| | `E` | Eraser |
| | `M` | Marquee 선택 |
| | `G` | Bucket |
| | `I` | Eyedropper |
| | `T` | Text |
| 표시 | `F3` | Onion skin |
| | `Tab` | UI 숨기기 |
| | `Ctrl+휠` | Zoom |
| | `Space+드래그` | Pan |
| 편집 | `Ctrl+Z` / `Ctrl+Y` | Undo / Redo |
| | `Ctrl+A` | 전체 픽셀 선택 |
| | `Ctrl+Shift+A` | 전체 frame 선택 |
| | `Alt+클릭` | 색 찍기 |
| | `[` / `]` | 브러시 사이즈 |
| 프레임 | `Alt+B` | 새 frame 추가 |
| | `,` / `.` | 이전/다음 frame |
| Sprite | `Ctrl+Shift+H` | Flip Horizontal |
| | `Ctrl+Shift+V` | Flip Vertical |

## 부록 B. Tiled 단축키 치트시트

| 분류 | 키 | 동작 |
|---|---|---|
| 도구 | `B` | Stamp Brush |
| | `R` | Rectangle Fill |
| | `G` | Bucket Fill |
| | `Z` | Random fill |
| | `T` | Terrain Brush |
| | `E` | Eraser |
| | `S` | Selection |
| 표시 | `Space+드래그` | Pan |
| | `Ctrl+휠` | Zoom |
| 파일 | `Ctrl+S` | 저장 |
| | `Ctrl+E` | Export As |
| 레이어 | `Ctrl+Shift+N` | 새 Tile Layer |
| | `Ctrl+Shift+O` | 새 Object Layer |

## 부록 C. Claude Code 자주 쓸 요청 템플릿

```
# 색 변환
이 PNG의 빨강(#EF0107) 영역을 노랑(#FFD700)으로 변환해줘.
원본 파일명: shirt-arsenal-home.png
저장 파일명: shirt-arsenal-away.png

# 베이스 + 옷 합성
shirt-arsenal-home.png를 Seliel base walk_east 시퀀스에 합성해서
preview-arsenal-home.png 만들어줘.

# WebP 일괄 변환
public/metaverse/avatars/seliel-base/clothing/ 안의 모든 PNG를
WebP quality 85로 변환해줘. 원본 PNG는 보존.

# Sprite sheet 합치기
walk_east_0.png ~ walk_east_3.png를 horizontal strip 한 장으로 합치고
Phaser 호환 JSON 메타데이터(frame coords)도 같이 만들어줘.

# 메타데이터 점검
public/metaverse/avatars/seliel-base/ 안의 모든 sprite sheet의
frame size·count가 일관된지 확인해줘.

# Tiled JSON 검증
public/map/uk-london.json을 점검해서 충돌 레이어와 object 레이어가
Phaser tilemap loader 호환 형식인지 확인해줘.
```

## 부록 D. 라이센스 보관 — 권장 디렉토리

```
~/Documents/licenses/
├── README.md                                  ← 어떤 라이센스가 어떤 용도인지 메모
├── aseprite/
│   └── steam-receipt.pdf
├── seliel-character-base/
│   ├── itch-receipt.pdf
│   └── license-key.txt
├── limezu-modern-interiors/
│   └── itch-receipt.pdf
└── (외주 작가별)
    └── [작가명]/
        ├── 계약서.pdf
        ├── 영수증.pdf
        └── 납품물 목록.md
```

이 폴더는 **별도 백업** (Google Drive / iCloud / Dropbox) 권장. PC 고장 시 라이센스 복구 가능하게.
