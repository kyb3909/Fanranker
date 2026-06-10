# Example Run — Arsenal Legends

End-to-end trace of building "역대 아스널 레전드" draft game from a single natural language prompt.

## Turn 1 — User

```
아스날 역대 선수들로 드래프트 만들고 싶어. 시대는 전체로.
```

## Turn 2 — Orchestrator

State: `IDLE → DESIGN_INTERVIEW`. Calls Designer.

```json
{
  "next_agent": "Designer",
  "agent_input": {
    "prompt": "아스날 역대 선수들로 드래프트 만들고 싶어. 시대는 전체로.",
    "csv": null
  },
  "user_facing_message": "Designer 가 도메인 분류 + 규칙 인터뷰 준비 중...",
  "state": "DESIGN_INTERVIEW"
}
```

## Turn 3 — Designer output

```json
{
  "domain": "sports_football_club_legends",
  "domain_label_ko": "축구 / 클럽 레전드",
  "slug_suggestion": "arsenal-legends",
  "name_suggestion_ko": "역대 아스널 레전드",
  "description_suggestion_ko": "아스널 FC 의 역사를 만든 선수들로 11인 라인업을 구성하세요. Bergkamp 부터 Saka 까지.",
  "icon_emoji": "🔴",
  "theme_color": "#EF0107",
  "roster_size_default": 11,
  "budget_default": 80,
  "currency_label": "£",
  "formation_default": "4-3-3",
  "formation_options": ["4-4-2", "4-3-3", "3-5-2", "3-4-3"],
  "positions": [
    { "code": "GK", "label_en": "Goalkeeper", "label_ko": "골키퍼", "min_slots": 1, "max_slots": 1, "color": "#FFC107", "sort_order": 1 },
    { "code": "DF", "label_en": "Defender", "label_ko": "수비수", "min_slots": 3, "max_slots": 5, "color": "#2196F3", "sort_order": 2 },
    { "code": "MF", "label_en": "Midfielder", "label_ko": "미드필더", "min_slots": 3, "max_slots": 5, "color": "#4CAF50", "sort_order": 3 },
    { "code": "FW", "label_en": "Forward", "label_ko": "공격수", "min_slots": 1, "max_slots": 3, "color": "#F44336", "sort_order": 4 }
  ],
  "attribute_schema": [
    { "key": "goals", "label_ko": "골", "type": "number", "weight": 0.25 },
    { "key": "assists", "label_ko": "어시", "type": "number", "weight": 0.15 },
    { "key": "trophies", "label_ko": "트로피", "type": "number", "weight": 0.15 },
    { "key": "appearances", "label_ko": "출전수", "type": "number", "weight": 0.10 },
    { "key": "iconicity", "label_ko": "상징성", "type": "tier", "weight": 0.35 }
  ],
  "interview_questions": [
    {
      "id": "min_appearances",
      "question_ko": "최소 출전수 컷오프? (낮을수록 무명 선수 포함)",
      "options": ["50경기", "100경기", "200경기", "컷오프 없음"],
      "default": "100경기"
    },
    {
      "id": "include_loanees",
      "question_ko": "임대로 잠깐 거쳐간 선수도 포함?",
      "options": ["포함", "제외"],
      "default": "제외"
    },
    {
      "id": "entity_pool_size",
      "question_ko": "후보 풀 사이즈?",
      "options": ["40명", "60명 (추천)", "80명"],
      "default": "60명 (추천)"
    }
  ],
  "needs_user_confirmation": true,
  "confidence": 0.92
}
```

## Turn 4 — User

```
다 기본값으로
```

## Turn 5 — Orchestrator

State: `DESIGN_INTERVIEW → RESEARCHING`. Calls Researcher.

```json
{
  "next_agent": "Researcher",
  "agent_input": {
    "domain": "sports_football_club_legends",
    "slug": "arsenal-legends",
    "name": "역대 아스널 레전드",
    "roster_size": 11,
    "budget": 80,
    "currency_label": "£",
    "positions": [...],
    "attribute_schema": [...],
    "user_rules": {
      "min_appearances": 100,
      "include_loanees": false,
      "era_range": "all"
    },
    "target_entity_count": 60
  },
  "user_facing_message": "Researcher 가 아스날 역대 60명 검색 중... (Google 종합 검색)",
  "state": "RESEARCHING"
}
```

## Turn 6 — Researcher output (partial — 3 of 60)

```json
{
  "entities": [
    {
      "external_id": "arsenal-henry",
      "name": "Thierry Henry",
      "name_ko": "티에리 앙리",
      "primary_position": "FW",
      "team": "Arsenal",
      "team_ko": "아스날",
      "era": "1999-2007 / 2012",
      "description_ko": "클럽 역대 최다 득점자 228골. Invincibles 시즌 PFA 올해의 선수. 발롱도르 2위 2회.",
      "attributes": {
        "goals": 228, "assists": 109, "trophies": 4, "appearances": 377, "iconicity": "S+"
      },
      "estimated_price": 15.0,
      "estimated": false,
      "confidence": 0.97,
      "sources": [
        "https://en.wikipedia.org/wiki/Thierry_Henry",
        "https://www.arsenal.com/legends/thierry-henry"
      ],
      "notes_ko": ""
    },
    {
      "external_id": "arsenal-bergkamp",
      "name": "Dennis Bergkamp",
      "name_ko": "데니스 베르캄프",
      "primary_position": "FW",
      "team": "Arsenal",
      "team_ko": "아스날",
      "era": "1995-2006",
      "description_ko": "Non-flying Dutchman. Newcastle 360도 골 등 명장면 다수. Invincibles 멤버.",
      "attributes": {
        "goals": 120, "assists": 94, "trophies": 7, "appearances": 423, "iconicity": "S"
      },
      "estimated_price": 13.0,
      "estimated": false,
      "confidence": 0.95,
      "sources": [
        "https://en.wikipedia.org/wiki/Dennis_Bergkamp",
        "https://www.transfermarkt.com/dennis-bergkamp/profil/spieler/3580"
      ],
      "notes_ko": ""
    },
    {
      "external_id": "arsenal-rocastle",
      "name": "David Rocastle",
      "name_ko": "데이비드 로카스틀",
      "primary_position": "MF",
      "team": "Arsenal",
      "team_ko": "아스날",
      "era": "1985-1992",
      "description_ko": "Rocky. Hale End 출신. 1989 / 1991 리그 우승 주역. 33세 타계.",
      "attributes": {
        "goals": 34, "assists": 41, "trophies": 4, "appearances": 277, "iconicity": "A"
      },
      "estimated_price": 7.5,
      "estimated": true,
      "confidence": 0.78,
      "sources": [
        "https://en.wikipedia.org/wiki/David_Rocastle",
        "https://namu.wiki/w/데이비드 로카스틀"
      ],
      "notes_ko": "assists 수치는 추정. 80년대 통계 부정확."
    }
  ],
  "metadata": {
    "total_entities": 60,
    "domain": "sports_football_club_legends",
    "estimated_count": 14,
    "search_queries_used": [
      "Arsenal greatest players all time",
      "Arsenal Invincibles squad 2003-04",
      "Arsenal Hale End academy graduates",
      "Henry Bergkamp Vieira Pires stats",
      "Arsenal captains history"
    ],
    "warnings_ko": [
      "1980년대 이전 선수 14명의 assists 수치는 추정값",
      "현역 선수 8명 포함. 시즌 진행 중이라 stats 변동 가능"
    ]
  }
}
```

## Turn 7 — Orchestrator

State: `RESEARCHING → WRITING`. Calls Writer.

```json
{
  "next_agent": "Writer",
  "agent_input": {
    "game_definition": { ... from Designer + user answers ... },
    "entities": [ ... 60 from Researcher ... ]
  },
  "user_facing_message": "Writer 가 CSV 출력 + 검증 중...",
  "state": "WRITING"
}
```

## Turn 8 — Writer output

```json
{
  "csv_01_game_meta": "slug,name,description,icon_emoji,theme_color,roster_size,currency_label,budget,formation_default,formation_options,sort_order,is_active\narsenal-legends,역대 아스널 레전드,\"아스널 FC 의 역사를 만든 선수들로 11인 라인업을 구성하세요. Bergkamp 부터 Saka 까지.\",🔴,#EF0107,11,£,80,4-3-3,4-4-2|4-3-3|3-5-2|3-4-3,10,true",

  "csv_02_game_positions": "game_slug,position_code,position_label_en,position_label_ko,min_slots,max_slots,color,sort_order\narsenal-legends,GK,Goalkeeper,골키퍼,1,1,#FFC107,1\narsenal-legends,DF,Defender,수비수,3,5,#2196F3,2\narsenal-legends,MF,Midfielder,미드필더,3,5,#4CAF50,3\narsenal-legends,FW,Forward,공격수,1,3,#F44336,4",

  "csv_03_game_items": "game_slug,external_id,name,name_ko,image_url,primary_position,price,team,team_ko,era,description_ko,attribute_json,estimated,source,notes,confidence\narsenal-legends,arsenal-henry,Thierry Henry,티에리 앙리,,FW,15.0,Arsenal,아스날,1999-2007 / 2012,\"클럽 역대 최다 득점자 228골. Invincibles 시즌 PFA 올해의 선수.\",\"{\"\"goals\"\":228,\"\"assists\"\":109,\"\"trophies\"\":4,\"\"appearances\"\":377,\"\"iconicity\"\":\"\"S+\"\"}\",false,https://en.wikipedia.org/wiki/Thierry_Henry,,0.97\n... (59 more rows) ...",

  "validation_report": {
    "passed": true,
    "errors": [],
    "warnings": [
      "14 of 60 entities have estimated=true. 운영자 검토 권장.",
      "현역 선수 8명 포함 — stats 변동 가능"
    ],
    "stats": {
      "total_entities": 60,
      "by_position": { "GK": 6, "DF": 18, "MF": 22, "FW": 14 },
      "price_distribution": { "min": 1.5, "max": 15.0, "median": 6.5 },
      "tier_distribution": { "S": 6, "A": 14, "B": 22, "C": 14, "D": 4 },
      "estimated_count": 14,
      "with_source": 58
    }
  }
}
```

## Turn 9 — Orchestrator (final)

State: `WRITING → DONE`.

```json
{
  "next_agent": null,
  "user_facing_message": "역대 아스널 레전드 60명 CSV 생성 완료. 위치 분포 GK 6 / DF 18 / MF 22 / FW 14. 14명은 추정값 (estimated=true) — 검토 후 DB import 부탁드립니다. 다운로드 링크 3개:\n\n- 01-game-meta.csv\n- 02-game-positions.csv\n- 03-game-items.csv",
  "state": "DONE"
}
```

## Total cost (estimated)

- Designer: 1 LLM call, ~2K tokens
- Researcher: 1 LLM call + ~15 search queries, ~8-12K tokens
- Writer: 1 LLM call, ~3K tokens

Total: 3 LLM calls + 15 searches. Claude Sonnet 기준 ~$0.05-0.10 per game. Search API 비용 별도 (Brave 무료 tier 안에 들어감).

## What user does next

1. Download 3 CSVs
2. Review `03-game-items.csv` — focus on rows where `estimated=true`. Fix names / prices / positions as needed.
3. Either:
   - **(option A)** Hand-import via Supabase Studio (SQL INSERT)
   - **(option B)** Use future `/admin/draft/import` UI (when built)
4. Visit `/games/draft/arsenal-legends` to verify game shows up

## Failure modes seen in this domain

- Pre-1990 stats unreliable (assists rarely tracked) → estimated=true expected
- Hale End graduates (academy) often missed in "greatest" lists → seed with extra query
- Loanees ambiguity (e.g. Cazorla second spell) → respect user's `include_loanees=false`
- Current squad changes → re-run quarterly for active rosters
