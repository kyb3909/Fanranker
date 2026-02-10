# Betman 데이터 수집

## 방법 A: Playwright 스크립트 (권장)

Betman 서버가 HTTP만으로는 HTML 에러 페이지를 돌려주는 경우, **Playwright**로 브라우저를 띄워 같은 페이지에서 API를 호출하면 JSON을 받을 수 있습니다.

### 사용법

```bash
# playwright 설치 (최초 1회)
pnpm add -D playwright

# 회차 지정 (기본 260018)
pnpm run betman-fetch 260019

# 또는 환경변수
BETMAN_GM_TS=260019 pnpm run betman-fetch
```

### API 주소

- 로컬: `http://localhost:3000` (기본)
- 배포: `NEXT_PUBLIC_APP_URL` 또는 `VERCEL_URL` 환경변수로 지정

스크립트가 하는 일: `gameSlip.do` 페이지 접속 → 페이지 안에서 `gameInfoInq.do` 호출 → JSON 파싱 → `POST /api/betman/round` → `POST /api/betman/games`

### n8n에서 실행하려면

**Execute Command** 노드에서:
- Command: `pnpm run betman-fetch`
- 또는 `BETMAN_GM_TS={{ $json.gmTs }} pnpm run betman-fetch` (이전 노드에서 gmTs 전달)

---

## 방법 B: n8n 워크플로우 (6단계)

Betman이 쿠키만으로 JSON을 돌려주는 경우에만 동작합니다. 그렇지 않으면 방법 A를 쓰세요.

### 전체 흐름

```
노드1: HTTP Request (POST /api/betman/round)
  ↓
노드2: HTTP Request (GET gameSlip.do, Full Response)
  ↓
노드3: Code (쿠키 추출)
  ↓
노드4: HTTP Request (POST gameInfoInq.do + Cookie 헤더)
  ↓
노드5: Code (JSON 파싱)
  ↓
노드6: HTTP Request (POST /api/betman/games)
```

---

## 노드1: HTTP Request – 라운드 생성

- **Method**: POST
- **URL**: `https://community-app-brown.vercel.app/api/betman/round`
- **Body Content Type**: JSON
- **Body**:
```json
{
  "gm_id": "G101",
  "gm_ts": 260018,
  "round_name": "프로토 승부식 26018"
}
```

---

## 노드2: HTTP Request – 세션 쿠키 받기

- **Method**: GET
- **URL**: `https://www.betman.co.kr/buyPsblGame/gameSlip.do`
- **Options** (아래쪽 Options 섹션 열기):
  - **Response** → **Full Response** = **ON** (중요!)
  - 이렇게 해야 응답 헤더(Set-Cookie 포함)가 출력에 포함됩니다.

---

## 노드3: Code – 쿠키 추출

- **Code** 노드 추가
- `scripts/n8n-betman-extract-cookies.js` 전체 복사 후 붙여넣기
- 출력: `{ cookies: "JSESSIONID=xxx; PCID=yyy; ..." }`

---

## 노드4: HTTP Request – 경기 데이터 가져오기

- **Method**: POST
- **URL**: `https://www.betman.co.kr/buyPsblGame/gameInfoInq.do`
- **Send Headers** 체크 → 아래 3개 헤더 추가:

| Name | Value |
|------|-------|
| `Cookie` | `{{ $json.cookies }}` |
| `X-Requested-With` | `XMLHttpRequest` |
| `Referer` | `https://www.betman.co.kr/buyPsblGame/gameSlip.do` |

- **Body Content Type**: JSON
- **Body**:
```json
{
  "gmId": "G101",
  "gmTs": 260018,
  "gameYear": "",
  "_sbmInfo": {
    "_sbmInfo": {
      "debugMode": "false"
    }
  }
}
```

---

## 노드5: Code – JSON 파싱

- **Code** 노드 추가
- `scripts/n8n-betman-parse-gameslip.js` 전체 복사 후 붙여넣기
- 스크립트 상단의 `roundNode` 값을 **노드1**의 이름으로 맞추기
  (기본: `'HTTP Request'`)
- 출력: `{ roundId, games }` (games 배열에 경기 데이터)

---

## 노드6: HTTP Request – 경기 저장

- **Method**: POST
- **URL**: `https://community-app-brown.vercel.app/api/betman/games`
- **Body Content Type**: JSON
- **Body**:
```json
{
  "roundId": "{{ $json.roundId }}",
  "games": {{ JSON.stringify($json.games) }}
}
```

---

## 회차 변경 시

바꿔야 하는 값:
- **노드1**: `gm_ts`, `round_name`
- **노드4**: Body의 `gmTs` (노드1의 gm_ts와 동일 값)

예) 19회차: `gm_ts: 260019`, `gmTs: 260019`
