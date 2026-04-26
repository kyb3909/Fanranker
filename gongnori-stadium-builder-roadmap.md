# 공놀이 경기장 건설 시스템 — 구현 로드맵

## 전체 구조 요약

```
Layer 1: World Map (세계 지도 + 경기장 핀)
  └─ Layer 2: Stadium Chat Room (사이드스크롤러 + 아바타 + 채팅)
       └─ Layer 3: Minigames (테트리스 등, 1분 제한)
            └─ 점수 → 경기장 건설 포인트로 전환
```

기술 스택: Next.js (기존) + Phaser.js (게임 엔진) + Supabase (DB/Realtime)

---

## Phase 0: 환경 세팅 (1~2일)

### 0-1. Phaser.js 설치 및 Next.js 연동

```bash
npm install phaser
```

Next.js에서 Phaser는 클라이언트 전용이므로 dynamic import 필수:

```tsx
// components/PhaserGame.tsx
'use client';
import dynamic from 'next/dynamic';

const GameComponent = dynamic(() => import('./GameCanvas'), {
  ssr: false,
  loading: () => <div>로딩 중...</div>
});
```

### 0-2. 프로젝트 폴더 구조 잡기

```
src/
├── game/
│   ├── scenes/
│   │   ├── WorldMapScene.ts       # Layer 1
│   │   ├── StadiumChatScene.ts    # Layer 2
│   │   └── minigames/
│   │       ├── TetrisScene.ts     # Layer 3
│   │       ├── BlockStackScene.ts
│   │       └── PenaltyKickScene.ts
│   ├── objects/
│   │   ├── Avatar.ts
│   │   ├── ChatBubble.ts
│   │   └── Stadium.ts
│   ├── config.ts                  # Phaser 설정
│   └── index.ts                   # 진입점
├── components/
│   ├── PhaserGame.tsx             # Phaser 래퍼
│   └── GameOverlay.tsx            # React UI 오버레이 (채팅 입력 등)
└── lib/
    └── stadium-builder.ts         # 건설 포인트 로직
```

### 0-3. Phaser 기본 설정

```ts
// game/config.ts
import Phaser from 'phaser';

export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  pixelArt: true,         // 픽셀아트 선명하게
  roundPixels: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: 'arcade',
    arcade: { gravity: { x: 0, y: 0 }, debug: false }
  },
  scene: []  // 동적으로 추가
};
```

---

## Phase 1: World Map (Layer 1) — 2~3일

### 1-1. 맵 에셋 준비

- Tiled Map Editor로 세계 지도 타일맵 제작 (이전 UK맵 작업 경험 활용)
- 또는 심플하게: 하나의 큰 세계 지도 이미지 + 경기장 위치에 인터랙티브 핀
- 픽셀아트 스타일 세계 지도 (해상도: 1600x800 정도)

### 1-2. WorldMapScene 구현

```ts
// game/scenes/WorldMapScene.ts
export class WorldMapScene extends Phaser.Scene {
  constructor() { super('WorldMap'); }

  create() {
    // 1) 세계 지도 배경
    const map = this.add.image(0, 0, 'world-map').setOrigin(0);

    // 2) 카메라 드래그로 지도 탐색
    this.cameras.main.setBounds(0, 0, 1600, 800);
    this.input.on('pointermove', (p) => {
      if (p.isDown) {
        this.cameras.main.scrollX -= (p.x - p.prevPosition.x);
        this.cameras.main.scrollY -= (p.y - p.prevPosition.y);
      }
    });

    // 3) 경기장 핀 배치
    this.createStadiumPin(510, 230, 'emirates', 'Emirates Stadium');
    this.createStadiumPin(490, 235, 'anfield', 'Anfield');
    this.createStadiumPin(580, 310, 'camp-nou', 'Camp Nou');
    // ... 더 추가
  }

  createStadiumPin(x, y, id, name) {
    const pin = this.add.sprite(x, y, 'pin')
      .setInteractive({ useHandCursor: true });

    // 호버 시 이름 표시
    const label = this.add.text(x, y - 20, name, {
      fontFamily: 'Press Start 2P',
      fontSize: '8px',
      backgroundColor: '#000000aa',
      padding: { x: 4, y: 2 }
    }).setOrigin(0.5).setVisible(false);

    pin.on('pointerover', () => label.setVisible(true));
    pin.on('pointerout', () => label.setVisible(false));

    // 클릭 시 해당 경기장 채팅방으로 전환
    pin.on('pointerdown', () => {
      this.scene.start('StadiumChat', { stadiumId: id, stadiumName: name });
    });

    // 핀 바운스 애니메이션
    this.tweens.add({
      targets: pin, y: y - 3,
      duration: 800, yoyo: true, repeat: -1,
      ease: 'Sine.easeInOut'
    });
  }
}
```

### 1-3. 필요한 에셋 목록

| 에셋 | 사이즈 | 설명 |
|------|--------|------|
| world-map.png | 1600x800 | 픽셀아트 세계 지도 |
| pin.png | 16x24 | 경기장 위치 핀 (스프라이트) |
| pin-glow.png | 24x32 | 핀 호버 이펙트 |

에셋 제작 방법:
- Aseprite 또는 Piskel(무료)로 직접 그리기
- AI 이미지 생성 → 다운스케일로 픽셀아트 변환
- itch.io에서 무료 픽셀아트 타일셋 활용 후 커스터마이즈

---

## Phase 2: Stadium Chat Room (Layer 2) — 5~7일

### 2-1. 경기장 배경 구성

사이드스크롤러 뷰로 경기장 내부를 표현:

```
[관중석] [잔디 필드] [미니게임 존] [라커룸] [매점]
← 좌우 스크롤로 이동 →
```

- Tiled Map Editor로 경기장 내부 타일맵 제작
- 가로 2400px 정도의 넓은 맵, 세로 400px
- 구역별로 다른 배경 타일 (잔디, 콘크리트, 라커룸 등)

### 2-2. 아바타 시스템

```ts
// game/objects/Avatar.ts
export class Avatar extends Phaser.GameObjects.Sprite {
  nickname: string;
  chatBubble: ChatBubble | null = null;

  constructor(scene, x, y, texture, nickname) {
    super(scene, x, y, texture);
    this.nickname = nickname;

    // 닉네임 텍스트
    this.nameTag = scene.add.text(x, y - 20, nickname, {
      fontFamily: 'Press Start 2P',
      fontSize: '6px',
      color: '#ffffff'
    }).setOrigin(0.5);

    scene.physics.add.existing(this);
    scene.add.existing(this);
  }

  // 4방향 or 좌우 이동 애니메이션
  update(cursors) {
    const speed = 100;
    this.body.setVelocity(0);

    if (cursors.left.isDown) {
      this.body.setVelocityX(-speed);
      this.setFlipX(true);
      this.anims.play('walk', true);
    } else if (cursors.right.isDown) {
      this.body.setVelocityX(speed);
      this.setFlipX(false);
      this.anims.play('walk', true);
    } else {
      this.anims.play('idle', true);
    }

    // 닉네임 위치 동기화
    this.nameTag.setPosition(this.x, this.y - 20);
  }

  showChat(message: string) {
    this.chatBubble?.destroy();
    this.chatBubble = new ChatBubble(this.scene, this.x, this.y - 36, message);
    // 3초 후 사라짐
    this.scene.time.delayedCall(3000, () => {
      this.chatBubble?.destroy();
      this.chatBubble = null;
    });
  }
}
```

### 2-3. 아바타 스프라이트시트 사양

| 상태 | 프레임 수 | 사이즈 |
|------|----------|--------|
| idle | 2 | 16x24 per frame |
| walk | 4 | 16x24 per frame |
| jump/celebrate | 3 | 16x24 per frame |

스프라이트시트: 가로로 나열, 한 줄에 한 애니메이션.

### 2-4. Supabase Realtime 연동 (멀티플레이어)

```ts
// lib/realtime-sync.ts
import { supabase } from './supabase';

export class RealtimeSync {
  channel: any;

  connect(stadiumId: string, userId: string) {
    this.channel = supabase.channel(`stadium:${stadiumId}`);

    // 내 위치 브로드캐스트 (100ms throttle)
    this.channel.on('broadcast', { event: 'position' }, ({ payload }) => {
      // 다른 유저 아바타 위치 업데이트
      this.onPlayerMove(payload.userId, payload.x, payload.y, payload.anim);
    });

    // 채팅 메시지
    this.channel.on('broadcast', { event: 'chat' }, ({ payload }) => {
      this.onChatMessage(payload.userId, payload.nickname, payload.message);
    });

    this.channel.subscribe();
  }

  sendPosition(userId, x, y, anim) {
    this.channel.send({
      type: 'broadcast',
      event: 'position',
      payload: { userId, x, y, anim }
    });
  }

  sendChat(userId, nickname, message) {
    this.channel.send({
      type: 'broadcast',
      event: 'chat',
      payload: { userId, nickname, message }
    });
  }
}
```

### 2-5. StadiumChatScene 구현

```ts
// game/scenes/StadiumChatScene.ts
export class StadiumChatScene extends Phaser.Scene {
  myAvatar: Avatar;
  otherAvatars: Map<string, Avatar> = new Map();
  realtime: RealtimeSync;

  create(data: { stadiumId: string }) {
    // 1) 타일맵 로드
    const map = this.make.tilemap({ key: `stadium-${data.stadiumId}` });
    // ... 타일맵 레이어 설정

    // 2) 내 아바타 생성
    this.myAvatar = new Avatar(this, 400, 300, 'avatar', '나의닉네임');

    // 3) 카메라가 아바타 따라감
    this.cameras.main.startFollow(this.myAvatar);
    this.cameras.main.setBounds(0, 0, 2400, 400);

    // 4) 미니게임 존 트리거
    const minigameZone = this.add.zone(1800, 200, 200, 200);
    this.physics.add.existing(minigameZone, true);
    this.physics.add.overlap(this.myAvatar, minigameZone, () => {
      this.showMinigamePrompt();
    });

    // 5) 경기장 건설 진행도 표시 (경기장 중앙에)
    this.stadiumView = new StadiumProgressView(this, 600, 100, data.stadiumId);

    // 6) Realtime 연결
    this.realtime = new RealtimeSync();
    this.realtime.connect(data.stadiumId, currentUserId);
    this.realtime.onPlayerMove = (uid, x, y, anim) => {
      // 다른 유저 아바타 이동 처리
    };
    this.realtime.onChatMessage = (uid, nick, msg) => {
      const avatar = this.otherAvatars.get(uid);
      avatar?.showChat(msg);
    };

    // 7) 키보드 입력
    this.cursors = this.input.keyboard.createCursorKeys();
  }

  showMinigamePrompt() {
    // React 오버레이로 미니게임 선택 UI 표시
    // EventEmitter로 React ↔ Phaser 통신
    window.dispatchEvent(new CustomEvent('show-minigame-select', {
      detail: { stadiumId: this.stadiumId }
    }));
  }

  update() {
    this.myAvatar.update(this.cursors);
    // 100ms throttle로 위치 전송
    this.sendPositionThrottled();
  }
}
```

### 2-6. 채팅 입력 UI (React 오버레이)

Phaser 캔버스 위에 React 컴포넌트를 오버레이:

```tsx
// components/GameOverlay.tsx
export function GameOverlay({ stadiumId }) {
  const [message, setMessage] = useState('');

  const sendChat = () => {
    // Phaser 씬에 이벤트 전달
    window.dispatchEvent(new CustomEvent('send-chat', {
      detail: { message }
    }));
    setMessage('');
  };

  return (
    <div className="absolute bottom-0 left-0 right-0 p-4">
      <input
        value={message}
        onChange={e => setMessage(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && sendChat()}
        placeholder="채팅 입력..."
        className="w-full px-4 py-2 rounded-lg bg-black/60 text-white"
      />
    </div>
  );
}
```

---

## Phase 3: 미니게임 — 테트리스 (Layer 3) — 3~4일

### 3-1. TetrisScene 기본 구조

```ts
// game/scenes/minigames/TetrisScene.ts
export class TetrisScene extends Phaser.Scene {
  board: number[][];
  timer: number = 60;  // 1분 제한
  score: number = 0;
  stadiumId: string;

  create(data: { stadiumId: string }) {
    this.stadiumId = data.stadiumId;
    this.board = Array.from({ length: 20 }, () => Array(10).fill(0));

    // 1) 게임 보드 그리기 (픽셀아트)
    this.boardGraphics = this.add.graphics();

    // 2) 60초 타이머
    this.timerText = this.add.text(10, 10, '60', {
      fontFamily: 'Press Start 2P', fontSize: '16px'
    });

    this.time.addEvent({
      delay: 1000,
      repeat: 59,
      callback: () => {
        this.timer--;
        this.timerText.setText(String(this.timer));
        if (this.timer <= 0) this.gameOver();
      }
    });

    // 3) 점수 표시
    this.scoreText = this.add.text(10, 30, 'Score: 0', {
      fontFamily: 'Press Start 2P', fontSize: '10px'
    });

    // 4) 사이드에 경기장 미니 프리뷰 (건설 진행도)
    this.stadiumPreview = this.add.container(650, 300);

    // 5) 테트리스 로직 시작
    this.spawnPiece();
  }

  gameOver() {
    // 점수를 건설 포인트로 전환
    this.contributePoints(this.score);

    // 결과 화면
    this.add.text(400, 250, `${this.score}pt 기여!`, {
      fontFamily: 'Press Start 2P', fontSize: '14px'
    }).setOrigin(0.5);

    // 3초 후 채팅방으로 복귀
    this.time.delayedCall(3000, () => {
      this.scene.start('StadiumChat', { stadiumId: this.stadiumId });
    });
  }

  async contributePoints(points: number) {
    // Supabase에 포인트 기록
    await supabase.rpc('contribute_stadium_points', {
      p_stadium_id: this.stadiumId,
      p_user_id: currentUserId,
      p_points: points
    });
  }
}
```

### 3-2. 테트리스 핵심 로직 체크리스트

- [ ] 7종 테트로미노 (I, O, T, L, J, S, Z) 정의
- [ ] 블록 회전 (SRS 방식 또는 간단한 행렬 전치)
- [ ] 벽 차기(wall kick) — 벽에 닿았을 때 보정
- [ ] 줄 클리어 판정 + 점수 계산 (1줄=100, 2줄=300, 3줄=600, 4줄=1000)
- [ ] 고스트 피스 (착지 예상 위치 미리보기)
- [ ] 다음 블록 미리보기
- [ ] 하드 드롭 (Space)
- [ ] 60초 타이머 카운트다운
- [ ] 게임오버 시 점수 → 건설 포인트 전환

### 3-3. 모바일 터치 컨트롤

```ts
// 터치 영역 분할
// 화면 하단 1/3에 가상 버튼 or 스와이프 제스처
setupTouchControls() {
  // 좌우 스와이프 → 이동
  // 위 스와이프 → 회전
  // 아래 스와이프 → 소프트 드롭
  // 탭 → 하드 드롭

  let startX, startY;
  this.input.on('pointerdown', (p) => {
    startX = p.x; startY = p.y;
  });
  this.input.on('pointerup', (p) => {
    const dx = p.x - startX;
    const dy = p.y - startY;
    if (Math.abs(dx) < 10 && Math.abs(dy) < 10) {
      this.hardDrop(); // 탭
    } else if (Math.abs(dx) > Math.abs(dy)) {
      dx > 0 ? this.moveRight() : this.moveLeft(); // 좌우
    } else {
      dy > 0 ? this.softDrop() : this.rotate(); // 상하
    }
  });
}
```

---

## Phase 4: 경기장 건설 시스템 — 2~3일

### 4-1. DB 스키마 (Supabase)

```sql
-- 경기장 정보
CREATE TABLE stadiums (
  id TEXT PRIMARY KEY,           -- 'emirates', 'anfield' 등
  name TEXT NOT NULL,
  team TEXT NOT NULL,
  total_points BIGINT DEFAULT 0,
  current_stage INT DEFAULT 0,  -- 0~9
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 유저별 기여 기록
CREATE TABLE stadium_contributions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  stadium_id TEXT REFERENCES stadiums(id),
  user_id UUID REFERENCES users(id),
  points INT NOT NULL,
  source TEXT NOT NULL,          -- 'tetris', 'block_stack', 'penalty_kick'
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 기여 포인트 합산 RPC
CREATE OR REPLACE FUNCTION contribute_stadium_points(
  p_stadium_id TEXT,
  p_user_id UUID,
  p_points INT
) RETURNS void AS $$
BEGIN
  -- 기여 기록 저장
  INSERT INTO stadium_contributions (stadium_id, user_id, points, source)
  VALUES (p_stadium_id, p_user_id, p_points, 'tetris');

  -- 경기장 총 포인트 업데이트
  UPDATE stadiums
  SET total_points = total_points + p_points,
      current_stage = CASE
        WHEN total_points + p_points >= 20000 THEN 9
        WHEN total_points + p_points >= 16000 THEN 8
        WHEN total_points + p_points >= 13000 THEN 7
        WHEN total_points + p_points >= 10000 THEN 6
        WHEN total_points + p_points >= 7500 THEN 5
        WHEN total_points + p_points >= 5000 THEN 4
        WHEN total_points + p_points >= 3000 THEN 3
        WHEN total_points + p_points >= 1500 THEN 2
        WHEN total_points + p_points >= 500 THEN 1
        ELSE 0
      END
  WHERE id = p_stadium_id;
END;
$$ LANGUAGE plpgsql;
```

### 4-2. 건설 단계별 비주얼

| 단계 | 조건 | 비주얼 |
|------|------|--------|
| 0 | 0pt | 빈 땅 + 착공 표지판 |
| 1 | 500pt | 기초 콘크리트 |
| 2 | 1,500pt | 철골 구조물 |
| 3 | 3,000pt | 스탠드 한쪽 완성 |
| 4 | 5,000pt | 지붕 골조 |
| 5 | 7,500pt | 빨간 좌석 설치 |
| 6 | 10,000pt | 잔디 깔림 |
| 7 | 13,000pt | 조명탑 |
| 8 | 16,000pt | "EMIRATES STADIUM" 간판 |
| 9 | 20,000pt | 만원 관중 + 완공 이펙트 |

각 단계별로 별도 스프라이트 or 레이어 조합으로 구현.
Aseprite에서 레이어별로 그려두면 단계별 on/off로 처리 가능.

### 4-3. 건설 진행도 Realtime 반영

```ts
// 경기장 진행도 실시간 구독
supabase
  .channel('stadium-progress')
  .on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'stadiums',
    filter: `id=eq.${stadiumId}`
  }, (payload) => {
    const { current_stage, total_points } = payload.new;
    // Phaser 씬에 이벤트 전달 → 건설 애니메이션 트리거
    window.dispatchEvent(new CustomEvent('stadium-updated', {
      detail: { stage: current_stage, points: total_points }
    }));
  })
  .subscribe();
```

---

## Phase 5: 에셋 제작 — 병행 작업

### 5-1. 필요 에셋 전체 목록

**World Map**
- [ ] 세계 지도 타일셋 or 단일 이미지 (1600x800)
- [ ] 경기장 핀 스프라이트 (16x24, 2프레임 애니메이션)

**Stadium Chat Room (경기장당)**
- [ ] 경기장 내부 타일맵 배경 (2400x400)
- [ ] 구역 표시 오브젝트 (미니게임 존 아이콘, 매점, 라커룸 등)
- [ ] 경기장 건설 10단계 스프라이트 (각 180x180 정도)

**Avatar**
- [ ] 기본 아바타 스프라이트시트 (idle 2f + walk 4f + celebrate 3f, 16x24)
- [ ] 향후: 아바타 커스터마이징용 레이어 (모자, 유니폼 컬러 등)

**Minigame - Tetris**
- [ ] 테트로미노 블록 타일 (8x8 per cell, 7색)
- [ ] 게임 보드 프레임
- [ ] UI 요소 (타이머, 점수, 다음 블록 프레임)

**UI 공통**
- [ ] 픽셀 폰트 (Press Start 2P — Google Fonts 무료)
- [ ] 버튼 스프라이트 (일반/호버/클릭)
- [ ] 말풍선 9-slice 스프라이트

### 5-2. 에셋 제작 도구

| 도구 | 용도 | 비용 |
|------|------|------|
| Aseprite | 스프라이트/애니메이션 | $20 (일회성) |
| Piskel | 스프라이트 (무료 대안) | 무료 |
| Tiled Map Editor | 타일맵 제작 | 무료 |
| Press Start 2P | 픽셀 폰트 | 무료 |

---

## Phase 6: 통합 및 연결 — 2~3일

### 6-1. 씬 전환 플로우

```
WorldMapScene
  ↓ (핀 클릭)
StadiumChatScene(stadiumId)
  ↓ (미니게임 존 진입)
TetrisScene(stadiumId)
  ↓ (게임오버 → 포인트 기여)
StadiumChatScene(stadiumId)  ← 돌아옴
  ↓ (뒤로가기)
WorldMapScene
```

### 6-2. React ↔ Phaser 통신

```ts
// Phaser → React: CustomEvent
window.dispatchEvent(new CustomEvent('event-name', { detail: data }));

// React → Phaser: Phaser EventEmitter
// game.scene.getScene('StadiumChat').events.emit('send-chat', message);
```

### 6-3. 공놀이 기존 포인트 시스템 연동

미니게임 점수를 기존 activity_points에도 반영:

```sql
-- 미니게임 점수 → 활동 포인트 전환 비율
-- 테트리스 100점 = 활동 포인트 10pt (10:1 비율)
-- 이 비율은 밸런스 보면서 조정

UPDATE user_points
SET activity_points = activity_points + (p_points / 10)
WHERE user_id = p_user_id;
```

---

## Phase 7: 폴리시 & 런칭 — 2~3일

### 7-1. 필수 체크리스트

- [ ] 모바일 반응형 (터치 컨트롤, 화면 비율)
- [ ] 로딩 화면 (Phaser preload에서 에셋 로딩 프로그레스)
- [ ] 에러 핸들링 (Realtime 연결 끊김 시 재연결)
- [ ] 사운드 이펙트 (블록 착지, 줄 클리어, 단계 전환)
- [ ] 부정행위 방지 (서버 사이드 점수 검증 — 최소한)
- [ ] 하루 플레이 횟수 제한 or 쿨다운

### 7-2. 부정행위 방지 (최소 버전)

```sql
-- 비정상 점수 필터링
-- 1분 테트리스에서 이론 최대 점수 제한
CREATE OR REPLACE FUNCTION contribute_stadium_points(...)
BEGIN
  -- 1분에 최대 5000점 제한 (비현실적 점수 차단)
  IF p_points > 5000 THEN
    RAISE EXCEPTION 'Invalid score';
  END IF;

  -- 최근 60초 내 중복 제출 방지
  IF EXISTS (
    SELECT 1 FROM stadium_contributions
    WHERE user_id = p_user_id
    AND created_at > now() - interval '60 seconds'
  ) THEN
    RAISE EXCEPTION 'Too frequent';
  END IF;

  -- ... 기존 로직
END;
```

### 7-3. 성능 최적화

- Phaser 텍스처 아틀라스로 에셋 번들링 (HTTP 요청 줄이기)
- Realtime 위치 전송 throttle (100ms)
- 화면 밖 아바타 렌더링 스킵
- 미니게임 씬 전환 시 이전 씬 sleep 처리

---

## 전체 일정 요약

| Phase | 작업 | 예상 기간 |
|-------|------|----------|
| 0 | 환경 세팅 | 1~2일 |
| 1 | World Map | 2~3일 |
| 2 | Stadium Chat Room | 5~7일 |
| 3 | 테트리스 미니게임 | 3~4일 |
| 4 | 건설 시스템 | 2~3일 |
| 5 | 에셋 제작 | 병행 |
| 6 | 통합 연결 | 2~3일 |
| 7 | 폴리시 & 런칭 | 2~3일 |
| **합계** | | **약 3~4주** |

Phase 1~3을 먼저 MVP로 만들고, Phase 4~7은 점진적으로 붙여나가는 것을 권장.

---

## 다음 단계 미니게임 확장 (향후)

| 미니게임 | 컨셉 | 난이도 |
|---------|------|--------|
| 블록 쌓기 | 타이밍 맞춰 블록 드롭 (프로토타입 이미 있음) | 쉬움 |
| 페널티킥 | 방향 선택 → 골키퍼 AI 반응 | 중간 |
| 축구 퀴즈 | 팀/선수 관련 객관식 | 쉬움 |
| 헤딩 게임 | 떨어지는 공을 헤딩으로 받기 | 중간 |
