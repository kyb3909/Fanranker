# Pixel Hero Maker 4D — 유니폼 아바타 채팅 구현 가이드

> 목표: Pixel Hero Maker 4D 에셋 캐릭터를 이용자 아바타로 제공하고, 유니폼 아이템을 구매해 갈아입을 수 있는 채팅 서비스 구현

---

## 1. 전체 플로우 요약

```
Pixel Hero Maker 4D (Unity)
    → 베이스 캐릭터 스프라이트 시트 export (PNG)
    → Aseprite에서 유니폼 레이어 제작
    → 레이어 분리 PNG 웹앱에 등록
    → Canvas / CSS 합성으로 채팅창에 아바타 렌더링
    → Supabase로 보유 아이템 관리 + 실시간 채팅 연동
```

---

## 2. 스프라이트 제작

### 2-1. Pixel Hero Maker 4D 에디터에서 베이스 캐릭터 export

- Unity에서 에셋 임포트 후 Character Editor 실행
- 베이스 바디(상의 없음 or 기본 상의) 조합 선택
- `Save Sprite Sheet` → PNG로 export
- **4방향(상/하/좌/우) + 애니메이션(Idle, Walk 등) 포함된 시트** 생성됨

### 2-2. 유니폼 레이어 제작 방법 (3가지 선택지)

#### 옵션 A: 에셋 내 색상 교체만으로 해결 (가장 빠름)
- Pixel Hero Maker 에디터의 팔레트 교체 기능 활용
- 팀 컬러로만 구분 (예: 빨강 = 수원삼성, 파랑 = 수원FC)
- 장점: 별도 작업 없음
- 단점: 디테일 표현 한계

#### 옵션 B: Aseprite로 레이어 직접 제작 (권장)
- 도구: [Aseprite](https://www.aseprite.org/) (약 ₩20,000)
- 베이스 스프라이트 시트를 Aseprite에서 열고
- 유니폼 레이어만 별도로 그림
- 유니폼 1벌 작업 시간: 숙련도에 따라 1~3시간
- 모든 방향 × 모든 애니메이션 프레임에 레이어 적용 필요

#### 옵션 C: 외주 의뢰
- 크몽 / 라우드소싱 기준 캐릭터 1세트 약 3~10만원
- 구단 수 × 홈/어웨이 세트 기준으로 예산 산정
- 한 번 제작하면 영구 자산

---

## 3. 저작권 주의사항

### ❌ 피해야 할 것
| 항목 | 이유 |
|---|---|
| 실제 구단 엠블럼 사용 | 상표권 침해 |
| 실제 유니폼 디자인 그대로 재현 | 의류 브랜드 저작권 (나이키, 아디다스 등) |
| 유료 판매 시 실제 IP 사용 | 법적 리스크 |

### ✅ 안전한 방법 — "영감을 받은 가상 유니폼"
- 팀 컬러와 스타일은 살리되 로고는 자체 제작
- 예: 전북 현대 → 노랑+검정 줄무늬 + 커스텀 엠블럼
- FIFA, 풋볼매니저 시리즈도 동일한 방식 사용

---

## 4. 웹앱 렌더링 구현

### 4-1. 스프라이트 레이어 구조

```
z-index 1: 베이스 캐릭터 (body, 피부 등) — 고정
z-index 2: 유니폼 레이어 — 교체 가능
z-index 3: 악세서리/기타 — 선택
```

### 4-2. Canvas API 합성 예시 (React)

```javascript
const renderAvatar = async (baseSprite, uniformSprite, canvas) => {
  const ctx = canvas.getContext('2d');
  
  const base = new Image();
  base.src = baseSprite;
  await base.decode();
  ctx.drawImage(base, 0, 0);

  const uniform = new Image();
  uniform.src = uniformSprite;
  await uniform.decode();
  ctx.drawImage(uniform, 0, 0); // 같은 좌표에 레이어 합성
};
```

### 4-3. CSS z-index 방식 (더 간단)

```jsx
<div style={{ position: 'relative', width: 48, height: 48 }}>
  <img src={baseSprite} style={{ position: 'absolute' }} />
  <img src={uniformSprite} style={{ position: 'absolute' }} />
</div>
```

---

## 5. Supabase 스키마 설계

```sql
-- 아이템(유니폼) 목록
create table items (
  id uuid primary key default gen_random_uuid(),
  name text not null,           -- 예: "수원삼성 홈 유니폼"
  team text,                    -- 예: "suwon_samsung"
  sprite_url text not null,     -- Storage에 올린 PNG URL
  price int not null,           -- 포인트 or 현금
  created_at timestamptz default now()
);

-- 유저 보유 아이템
create table user_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  item_id uuid references items(id),
  equipped boolean default false,
  purchased_at timestamptz default now()
);

-- 현재 장착 아바타 (채팅 메시지에 표시)
create table user_profiles (
  user_id uuid primary key references auth.users(id),
  base_sprite text default 'default',
  equipped_item_id uuid references items(id), -- 현재 장착 유니폼
  updated_at timestamptz default now()
);
```

---

## 6. 채팅 메시지에 아바타 연동

### Supabase Realtime 채팅 메시지 구조

```javascript
// 메시지 전송 시 아바타 정보 포함
const sendMessage = async (text) => {
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('base_sprite, equipped_item_id, items(sprite_url)')
    .eq('user_id', userId)
    .single();

  await supabase.from('messages').insert({
    user_id: userId,
    text,
    avatar_base: profile.base_sprite,
    avatar_uniform: profile.items?.sprite_url ?? null,
    created_at: new Date().toISOString()
  });
};
```

### 채팅창 메시지 렌더링

```jsx
const ChatMessage = ({ message }) => (
  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
    <AvatarCanvas
      base={message.avatar_base}
      uniform={message.avatar_uniform}
    />
    <div className="bubble">{message.text}</div>
  </div>
);
```

---

## 7. 유니폼 상점 구현 포인트

- 포인트 기반이면 Supabase `user_points` 테이블로 관리
- 현금 결제 연동 시 토스페이먼츠 or 포트원(아임포트) 추천
- 구매 완료 → `user_items` insert → 즉시 장착 가능 상태로

---

## 8. 구현 난이도 요약

| 항목 | 난이도 | 비고 |
|---|---|---|
| 스프라이트 export (Unity) | ⭐⭐ | 에셋 에디터 조작 수준 |
| 유니폼 레이어 제작 (Aseprite) | ⭐⭐⭐ | 숙련도에 따라 다름 |
| 레이어 합성 렌더링 (Canvas/CSS) | ⭐⭐ | 코드 30줄 이내 |
| Supabase 아이템 관리 | ⭐⭐ | 기존 스키마 확장 |
| 실시간 채팅 아바타 표시 | ⭐⭐ | Realtime 메시지에 필드 추가 |
| 유니폼 상점 UI | ⭐⭐⭐ | 결제 연동 여부에 따라 복잡도 상승 |

---

## 9. 권장 툴 스택

| 역할 | 도구 |
|---|---|
| 캐릭터 에셋 | Pixel Hero Maker 4D (Unity Asset Store) |
| 픽셀아트 편집 | [Aseprite](https://www.aseprite.org/) |
| 백엔드/DB | Supabase |
| 프론트엔드 | React + Canvas API |
| 실시간 채팅 | Supabase Realtime |
| 이미지 스토리지 | Supabase Storage |
| 결제 (선택) | 토스페이먼츠 or 포트원 |

---

*Last updated: 2026-03-18*
