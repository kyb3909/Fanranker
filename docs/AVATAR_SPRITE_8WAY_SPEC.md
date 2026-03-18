# 8방향 스프라이트 아바타 제작/구현 스펙

## 문서 목적

라이브 채팅방의 현재 코드 기반 SVG 아바타는 기능 검증에는 충분하지만, 목표하는 픽셀아트 퀄리티에는 한계가 있다.  
이 문서는 `8방향 + 걷기 애니메이션 + 팀 유니폼 확장`을 전제로, 실제 서비스에 적용할 스프라이트 아바타의 제작 규격과 프론트엔드 구현 방식을 정의한다.

---

## 1. 방향성

### 목표

- 스포츠 응원방에 어울리는 **귀엽고 읽기 쉬운 픽셀 캐릭터**
- 최대 20명이 동시에 보여도 **누가 누구인지 식별 가능**
- 유니폼 착용 시 **팀 구분이 한눈에 가능**
- 이동 시 **최소 8방향 방향감**이 느껴질 것

### 비목표

- 하이엔드 RPG 수준의 정교한 프레임 애니메이션
- 인물마다 완전히 다른 체형/헤어스타일
- 복잡한 뼈대 애니메이션 시스템

---

## 2. 왜 SVG/코드 기반만으로는 한계가 있는가

현재 방식은 방향 계산과 애니메이션 상태 관리에는 적합하지만, 아래 이유로 비주얼 완성도가 낮다.

- 실루엣이 단순해서 사람 형태가 장난감처럼 보임
- 얼굴/어깨/팔/다리의 볼륨감 표현이 약함
- 대각선 방향에서 비율이 쉽게 깨짐
- 유니폼 디테일, 명암, 외곽선 표현이 제한적임

따라서 최종 방향은:

**로직은 코드로 관리하고, 시각 표현은 실제 픽셀 스프라이트로 전환**

---

## 3. 권장 제작 방식

### 최종 권장안

- **베이스 캐릭터 스프라이트**
- **유니폼 오버레이 스프라이트**
- 필요 시 **그림자/액세서리 레이어**

즉, 캐릭터 1장을 완성 이미지로만 관리하지 말고 아래처럼 분리한다.

1. `base_body`
2. `uniform_overlay`
3. `optional_accessory`

이 구조면:

- 기본 캐릭터는 1세트만 제작
- 팀별 유니폼은 오버레이만 추가 제작
- 향후 시즌 유니폼/한정 유니폼도 쉽게 확장 가능

---

## 4. 프레임 규격

### 기본 캔버스

- **프레임 크기**: `32x48 px` 권장
- 이유:
  - 24x32보다 얼굴/상반신 디테일 확보가 쉬움
  - 48x64보다 화면 내 20명 배치 시 부담이 적음
  - 라이브룸 DOM 렌더링에서도 충분히 가벼움

### 렌더 크기

- 실제 화면 렌더링: `48px ~ 64px`
- `image-rendering: pixelated` 적용

---

## 5. 방향 및 애니메이션 규격

### 8방향

- `N`
- `NE`
- `E`
- `SE`
- `S`
- `SW`
- `W`
- `NW`

### 방향별 프레임 수

MVP 기준 권장:

- `idle`: 1프레임
- `walk`: 2프레임

즉, 방향당 3프레임

총 프레임 수:

- `8방향 x 3프레임 = 24프레임`

### 여유가 있으면

- `idle`: 2프레임 (미세한 호흡감)
- `walk`: 4프레임

하지만 MVP는 24프레임이면 충분하다.

---

## 5.1 실제 제작 방향 수 최적화

MVP에서는 8방향을 모두 개별 제작하지 않고, **5개 방향만 원본 제작 + 3개 방향은 좌우 반전**으로 처리하는 것을 권장한다.

### 원본 제작 권장 방향

- `N`
- `NE`
- `E`
- `SE`
- `S`

### 좌우 반전으로 생성할 방향

- `NW` = `NE` 좌우 반전
- `W` = `E` 좌우 반전
- `SW` = `SE` 좌우 반전

### 이유

- 캐릭터 일관성이 더 잘 유지됨
- 생성형 이미지 결과 편차를 줄일 수 있음
- 제작 비용과 시간을 줄일 수 있음
- 현재 스포츠 팬 캐릭터는 좌우 비대칭 장식이 적어서 반전 사용에 적합함

### 적용 조건

다만 아래 요소가 추가되면 반전 사용 여부를 다시 검토해야 한다.

- 한쪽에만 있는 머리 장식
- 한쪽 어깨에만 있는 패치
- 비대칭 유니폼 문양
- 한쪽만 보이는 액세서리

이 경우에도 MVP 단계에서는 반전으로 먼저 가고, 정식 아트 단계에서 개별 방향 리터치를 고려한다.

---

## 6. 스프라이트 시트 배치 규칙

### 권장 레이아웃

행 단위 방향 배치:

1. `N`
2. `NE`
3. `E`
4. `SE`
5. `S`
6. `SW`
7. `W`
8. `NW`

열 단위 프레임 배치:

1. `idle`
2. `walk_1`
3. `walk_2`

### 예시

```text
Row 1: N   [idle][walk1][walk2]
Row 2: NE  [idle][walk1][walk2]
Row 3: E   [idle][walk1][walk2]
Row 4: SE  [idle][walk1][walk2]
Row 5: S   [idle][walk1][walk2]
Row 6: SW  [idle][walk1][walk2]
Row 7: W   [idle][walk1][walk2]
Row 8: NW  [idle][walk1][walk2]
```

### 최종 시트 크기

- 프레임: `32x48`
- 열 3개, 행 8개
- 최종 이미지: `96x384 px`

### 반전 전략을 쓸 경우

실제 아트 파일은 아래 5개만 제작해도 된다.

```text
player-n.png
player-ne.png
player-e.png
player-se.png
player-s.png
```

런타임 또는 빌드 단계에서:

```text
player-nw = player-ne mirrored
player-w  = player-e mirrored
player-sw = player-se mirrored
```

---

## 7. 아트 스타일 가이드

### 비율

- **머리**: 전체 높이의 35~40%
- **몸통**: 30%
- **하체**: 30~35%

현재 테스트 버전은 몸통/하체 디테일이 부족해서 장난감처럼 보였다.  
최종본은 머리는 약간 크게 유지하되, **어깨선/팔/다리 분리가 명확해야 한다.**

### 외곽선

- 진한 외곽선 1px
- 내부 음영은 1~2단계만 사용
- 지나친 하이라이트는 피하고, 화면 축소 시 읽히는 실루엣 우선

### 얼굴

- 정면/대각선/측면에서 눈 위치 차이를 명확히
- 뒤 방향은 얼굴 요소 제거, 머리카락 실루엣 중심

### 걷기 모션

- 다리 간격 변화가 가장 중요
- 팔은 과장하지 말고 1~2px 정도만 흔들리게
- 대각선은 몸통 전체를 틀기보다, 머리/어깨/다리 비대칭으로 방향감 표현

---

## 8. 유니폼 레이어 규칙

### 구성

- 기본 바디 레이어: 피부, 머리, 바지, 신발
- 유니폼 레이어: 상의 중심

### 유니폼에 포함하면 좋은 요소

- 상의 주색
- 소매 색
- 중앙 스트라이프/사선/배색
- 팀 컬러 포인트

### MVP에서는 제외해도 되는 요소

- 복잡한 엠블럼
- 번호
- 양말 디테일
- 스폰서 로고

작게 보일 때는 로고가 거의 읽히지 않기 때문에, **색 배치만으로 팀 인지가 되는 디자인**이 우선이다.

---

## 9. 파일 구조 제안

```text
public/pixel-art/
  avatars/
    base/
      player-8way-base.png
    uniforms/
      tottenham-home.png
      arsenal-home.png
      lakers-home.png
      ...
```

또는 개별 파일 대신 시트 하나씩 관리:

```text
public/pixel-art/avatars/base/player-8way-base.png
public/pixel-art/avatars/uniforms/tottenham-home-8way.png
```

---

## 10. 프론트엔드 구현 구조

### 현재 관련 파일

- `components/live/pixel-avatar.tsx`
- `components/live/stadium-view.tsx`
- `hooks/use-live-chat.ts`

### 권장 변경 방향

#### 1. `pixel-avatar.tsx`

현재:

- 코드 기반 도형 렌더링

목표:

- 스프라이트 시트의 특정 프레임을 잘라서 보여주는 컴포넌트로 전환
- 필요 시 방향별 `mirrorX` 플래그를 받아 좌우 반전 렌더링 지원

예상 props:

```ts
type AvatarDirection = "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW"

interface SpriteAvatarProps {
  userId: string
  nickname: string
  direction: AvatarDirection
  moving: boolean
  size?: number
  baseSpriteSrc: string
  uniformSpriteSrc?: string
  mirrorX?: boolean
}
```

방향별 권장 매핑:

```ts
const DIRECTION_CONFIG = {
  N: { sprite: "player-n.png", mirrorX: false },
  NE: { sprite: "player-ne.png", mirrorX: false },
  E: { sprite: "player-e.png", mirrorX: false },
  SE: { sprite: "player-se.png", mirrorX: false },
  S: { sprite: "player-s.png", mirrorX: false },
  SW: { sprite: "player-se.png", mirrorX: true },
  W: { sprite: "player-e.png", mirrorX: true },
  NW: { sprite: "player-ne.png", mirrorX: true },
} as const
```

#### 2. `stadium-view.tsx`

현재 이미 하고 있는 것:

- 이전 좌표와 현재 좌표 비교
- 이동 방향 계산
- `moving` 상태 유지

이 로직은 그대로 유지하고, 렌더러만 교체하면 된다.

#### 3. `use-live-chat.ts`

현재:

- 좌표 변화로 이동 상태를 유추할 수 있음

향후 확장:

- 유저별 현재 착용 유니폼 id를 presence payload에 포함 가능

예:

```ts
interface PresencePayload {
  userId: string
  nickname: string
  x: number
  y: number
  uniformId?: string | null
}
```

---

## 11. 방향 계산 규칙

방향은 현재처럼 `dx, dy` 기반으로 계산하면 된다.

### 규칙

- `atan2(dy, dx)`로 각도 계산
- 45도 단위로 스냅
- 8방향으로 매핑

### 매핑

```ts
["E", "SE", "S", "SW", "W", "NW", "N", "NE"]
```

### 이동 상태

- 최근 200~300ms 내 좌표 변화가 있으면 `moving = true`
- 멈추면 `idle` 프레임으로 복귀

---

## 12. 렌더링 방식 제안

### 방법 A: CSS background-position

장점:

- 가장 단순
- DOM 하나로 처리 가능

예시:

```ts
const frameWidth = 32
const frameHeight = 48

const style = {
  width: `${frameWidth}px`,
  height: `${frameHeight}px`,
  backgroundImage: `url(${spriteSrc})`,
  backgroundPosition: `-${frameX * frameWidth}px -${frameY * frameHeight}px`,
  imageRendering: "pixelated" as const,
  transform: mirrorX ? "scaleX(-1)" : "none",
}
```

### 방법 B: canvas drawImage

장점:

- 레이어 합성(base + uniform)이 쉬움
- 색상 변형이나 후처리 유연

단점:

- React 컴포넌트 구조가 약간 복잡해짐

### 권장

MVP는 **CSS background-position + 다중 레이어 absolute div** 방식 권장

즉:

- 아래 레이어: base body
- 위 레이어: uniform overlay

---

## 13. 성능 기준

라이브룸 최대 20명 기준:

- 20명 * 2레이어(base + uniform) = 40 DOM 노드 수준
- 2프레임 걷기 애니메이션이면 충분히 가벼움
- requestAnimationFrame까지 갈 필요 없음

권장:

- 애니메이션은 `setInterval(160~200ms)` 또는 CSS steps
- 프레임 전환은 걷기 상태일 때만

---

## 14. 아트 제작 요청서 초안

외주나 디자이너에게 전달할 때는 아래처럼 요청하면 된다.

### 요청 내용

- 남녀 공용 느낌의 중성적 스포츠 팬 캐릭터 1종
- 8방향 기준
- 각 방향별 `idle 1 + walk 2`
- 총 24프레임
- 프레임 크기 32x48
- 투명 배경 PNG
- 유니폼 없는 베이스 캐릭터 1세트
- 유니폼 오버레이 1세트 이상

### 스타일 키워드

- 귀여운 픽셀 RPG
- 과하지 않은 SD 비율
- 머리 약간 큼
- 스포츠 팬 캐릭터
- 깔끔한 외곽선
- 작은 화면에서도 인지 가능한 실루엣

---

## 15. MVP 구현 순서

### 1단계

- 현재 코드 기반 아바타 유지
- 방향 계산 로직은 유지

### 2단계

- 실제 베이스 스프라이트 5방향 세트 적용 (`N`, `NE`, `E`, `SE`, `S`)
- `pixel-avatar.tsx` -> `sprite-avatar.tsx` 전환
- `NW`, `W`, `SW`는 좌우 반전으로 우선 대응

### 3단계

- 유니폼 오버레이 1~3종 적용
- 실제 구매/착용 로직 연결

### 4단계

- 팀별 유니폼 추가
- 상점/프로필/응원방 전체 반영

---

## 16. 수용 기준

### 비주얼

- 정면/대각선/측면/후면이 명확히 구분된다
- 20명 배치 시에도 사람 형태가 무너지지 않는다
- 유니폼 색만 보고도 팀 구분이 가능하다

### 기능

- 이동 방향에 따라 올바른 프레임이 표시된다
- 이동 중 걷기 프레임이 반복된다
- 정지 시 idle 프레임으로 복귀한다
- 유니폼 미착용/착용 상태를 렌더링할 수 있다

---

## 17. 결론

최종 퀄리티를 위해서는 **절차형 SVG 아바타가 아니라 실제 스프라이트 시트 기반 구조**로 가는 것이 맞다.

현재 라이브룸 아키텍처는 이미 방향 계산, 이동 상태, 닉네임/말풍선 표시가 갖춰져 있어서,  
좋은 스프라이트만 준비되면 비교적 쉽게 교체할 수 있다.

따라서 다음 액션은 아래 순서가 가장 합리적이다.

1. 8방향 베이스 스프라이트 1세트 제작
2. `sprite-avatar` 컴포넌트로 렌더러 교체
3. 팀 유니폼 오버레이 추가
4. 포인트 구매/착용과 연동

