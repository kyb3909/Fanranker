# 드래프트 게임 데이터 — CSV 운영자 가이드

## 한 줄 요약

CSV 3개로 새 드래프트 게임 정의 가능. **운영자가 채워서 업로드 → 코드 변경 없이 게임 자동 생성**.

## 3개 CSV의 역할

| 파일 | 역할 | 단위 |
|------|------|------|
| `01-game-meta.csv` | 게임 자체 정의 (이름, 색, 예산, 라인업 사이즈) | 1게임 = 1행 |
| `02-game-positions.csv` | 포지션 정의 (게임마다 다른 라인업 구조) | 1포지션 = 1행 |
| `03-game-items.csv` | 영입 대상 (선수/무장/캐릭터) | 1명 = 1행 |

`game_slug` 필드로 3개 파일이 연결됩니다.

---

## 01 — game-meta.csv (게임 정의)

| 컬럼 | 설명 | 예시 |
|------|------|------|
| `slug` | URL 식별자, 영문/하이픈만 (`/games/draft/{slug}` 으로 라우팅) | `arsenal-legends`, `slam-dunk` |
| `name` | 게임 표시 이름 (한국어 OK) | `역대 아스널 레전드` |
| `description` | 게임 설명 (1-2 문장) | `아스널의 역사를 만든 선수들로 ...` |
| `icon_emoji` | 탭/카드에 표시할 이모지 | `🔴`, `🏀`, `⚔️` |
| `theme_color` | 게임 메인 색상 (hex) | `#EF0107` (아스널 빨강) |
| `roster_size` | 최종 라인업 인원 수 (총 합 = positions의 min_slots 합) | `11` (축구), `5` (농구), `7` (K팝) |
| `currency_label` | 가격 단위 (UI 표시용) | `£`, `점수`, `충성도` |
| `budget` | 총 예산 (모든 영입의 price 합이 이 안에 들어가야) | `80`, `100` |
| `formation_default` | 기본 포메이션 식별자 | `4-3-3`, `positional`, `roles` |
| `formation_options` | 선택 가능한 포메이션들 (pipe `|` 구분) | `4-4-2\|4-3-3\|3-5-2` |
| `sort_order` | 게임 목록에서 표시 순서 (낮을수록 앞) | `10`, `20`, `30` |
| `is_active` | 활성화 여부 (`false` = 메뉴에서 숨김) | `true` / `false` |

**`formation_default` 값의 의미:**
- `4-3-3`, `4-4-2` 등 — 축구식 숫자 표기
- `positional` — 모든 포지션이 정확히 N슬롯 (포메이션 변형 없음 — 농구, K팝)
- `roles` — 역할 기반 (군주/책사/맹장 — 삼국지)
- 새 패턴 필요하면 코드 한번 더해야 함

---

## 02 — game-positions.csv (포지션 정의)

게임마다 라인업 구조가 다르므로 별도 테이블.

| 컬럼 | 설명 | 예시 |
|------|------|------|
| `game_slug` | 어느 게임 소속 | `arsenal-legends` |
| `position_code` | 코드 (영문 대문자) | `GK`, `PG`, `RULER` |
| `position_label_en` | 영문 표시 | `Goalkeeper`, `Point Guard` |
| `position_label_ko` | 한국어 표시 | `골키퍼`, `포인트가드` |
| `min_slots` | 최소 영입 인원 | `1` (꼭 1명), `3` (최소 3명) |
| `max_slots` | 최대 영입 인원 | `1` (정확히), `5` (최대 5명) |
| `color` | 배지 색 (hex) | `#FFC107` |
| `sort_order` | 표시 순서 | `1`, `2`, `3` |

**제약:** 모든 포지션의 `min_slots` 합 ≤ `roster_size` ≤ 모든 포지션의 `max_slots` 합.

축구 4-3-3 예시:
- GK 1-1, DF 3-5, MF 3-5, FW 1-3 → min 합 = 8, max 합 = 14, roster_size = 11 ✅

농구 5-out 예시:
- PG/SG/SF/PF/C 각각 1-1 → min 합 = 5, max 합 = 5, roster_size = 5 ✅ (변경 불가)

---

## 03 — game-items.csv (영입 대상)

선수, 무장, 캐릭터 등 드래프트 가능한 모든 대상.

| 컬럼 | 설명 | 예시 |
|------|------|------|
| `game_slug` | 소속 게임 | `arsenal-legends` |
| `external_id` | 게임 내 unique ID (영문/숫자/하이픈) | `arsenal-henry` |
| `name` | 영문 이름 | `Thierry Henry` |
| `name_ko` | 한국어 이름 | `티에리 앙리` |
| `image_url` | 이미지 경로 (또는 외부 URL) | `/draft/arsenal/henry.webp` |
| `primary_position` | `02` CSV의 position_code 중 하나 | `FW` |
| `price` | 영입 가격 | `15.0` |
| `team` | 출신 팀/세력 (옵션) | `Arsenal`, `Wei`, `Shohoku` |
| `team_ko` | 한국어 팀명 | `아스날`, `위`, `북산` |
| `era` | 시대/시즌 식별 (옵션, 검색·필터용) | `1999-2007`, `manga`, `late-han` |
| `description_ko` | 카드에 보이는 짧은 설명 (1-2줄) | `클럽 역대 최다 득점자. ...` |
| `attribute_json` | 게임별 능력치 (JSON 문자열) | `{"goals":228,"assists":109,"trophies":4}` |

**`attribute_json` 자유 스키마:**
게임마다 보고 싶은 능력치가 다르므로 JSON으로 자유 정의.
- 축구: `goals`, `assists`, `trophies`, `ballon_dor_rank`
- 농구: `height_cm`, `rebound` (S/A/B/C), `scoring`, `defense`
- 삼국지: `war`, `strategy`, `politics`, `charm` (0-100)
- K팝: `vocal`, `dance`, `rap`, `visual` (S/A/B 등)

UI에서 모든 키를 자동으로 표시 (admin이 추후 어떤 키를 prominent하게 보여줄지 설정 가능).

CSV에서 JSON 컬럼 ESCAPE 주의: 큰따옴표를 두 번 `""` 로. 예시: `"{""war"":97,""loyalty"":99}"`

---

## 운영자 Workflow

### Phase 1 (현재 권장 — 빠른 시작)

1. 3개 CSV 채우기 (이 폴더의 예시 파일 복사해서 시작)
2. `scripts/import-draft-game.ts` 실행 (TBD, 만들 예정):
   ```
   pnpm exec tsx scripts/import-draft-game.ts --meta 01-game-meta.csv --positions 02-game-positions.csv --items 03-game-items.csv
   ```
3. 스크립트가 검증 + Supabase에 insert
4. 자동으로 `/games/draft/{slug}` 라우트 활성화

### Phase 2 (향후 — admin UI)

1. `/admin/games/draft` 페이지에서 "새 게임 추가" 클릭
2. 3개 CSV 업로드 (또는 zip 파일)
3. 서버가 검증 + insert + 미리보기 제공
4. 즉시 활성화

---

## 필요한 DB 테이블 3개

이 CSV에 1:1로 매핑됩니다.

```sql
-- 01에 매핑
CREATE TABLE draft_game_types (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          text UNIQUE NOT NULL,
  name          text NOT NULL,
  description   text,
  icon_emoji    text,
  theme_color   text,
  roster_size   integer NOT NULL CHECK (roster_size > 0),
  currency_label text NOT NULL,
  budget        numeric NOT NULL CHECK (budget > 0),
  formation_default text NOT NULL,
  formation_options text[] NOT NULL DEFAULT '{}',
  sort_order    integer DEFAULT 0,
  is_active     boolean DEFAULT true,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

-- 02에 매핑
CREATE TABLE draft_game_positions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_type_id      uuid REFERENCES draft_game_types(id) ON DELETE CASCADE,
  position_code     text NOT NULL,
  position_label_en text NOT NULL,
  position_label_ko text NOT NULL,
  min_slots         integer NOT NULL CHECK (min_slots >= 0),
  max_slots         integer NOT NULL CHECK (max_slots >= min_slots),
  color             text,
  sort_order        integer DEFAULT 0,
  UNIQUE (game_type_id, position_code)
);

-- 03에 매핑
CREATE TABLE draft_game_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_type_id    uuid REFERENCES draft_game_types(id) ON DELETE CASCADE,
  external_id     text NOT NULL,
  name            text NOT NULL,
  name_ko         text,
  image_url       text,
  primary_position text NOT NULL,
  price           numeric NOT NULL CHECK (price >= 0),
  team            text,
  team_ko         text,
  era             text,
  description_ko  text,
  attribute_json  jsonb DEFAULT '{}',
  is_active       boolean DEFAULT true,
  created_at      timestamptz DEFAULT now(),
  UNIQUE (game_type_id, external_id)
);

CREATE INDEX idx_items_game_position ON draft_game_items (game_type_id, primary_position);
CREATE INDEX idx_items_attributes ON draft_game_items USING gin (attribute_json);
```

RLS: 모든 테이블 SELECT 모두 허용 (공개 콘텐츠), INSERT/UPDATE/DELETE는 admin only.

---

## 다음 단계 추천

지금 폴더에 있는 CSV는 **검증된 템플릿 + 5개 게임 예시** (아스널 레전드 / EPL 현역 / 슬램덩크 / 삼국지 / K팝 걸그룹).

저는 다음 순서를 추천:

1. **아스널 레전드만 풀로 채우기** (사용자 의도 첫 번째). 30-50명 정도.
2. **DB 마이그레이션 작성 + 적용** (위 SQL 스키마).
3. **import 스크립트 작성** (`scripts/import-draft-game.ts`). CSV → Supabase insert.
4. **/games/draft를 dynamic route로 변경** (`/games/draft/[slug]`). 현재 EPL JSON 기반 코드를 DB 조회로 전환.
5. **/admin/games/draft 업로드 UI** (Phase 2).

1-4단계가 핵심 인프라. 5는 운영 편의용으로 나중에.

지금 1단계 (아스널 레전드 데이터 풀로 채우기)부터 같이 갈까요? 시대별로 묶어서 30-50명 정도면 좋은 시작입니다.
