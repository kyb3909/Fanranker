# /redesign-safe

참조 페이지의 디자인을 다른 페이지들에 옮기되, **동작은 절대 건드리지 않는다.**

## 사용법
```
/redesign-safe <참조 페이지> <대상 페이지 1> [<대상 페이지 2> ...]
```
예: `/redesign-safe src/pages/Home.tsx src/pages/Profile.tsx src/pages/Settings.tsx`

## 시작 전 안내 (먼저 사용자에게 확인)
- 새 브랜치인지 확인 (`git checkout -b redesign/safe-port` 권장)
- 페이지마다 커밋 분리됨을 알림
- 페이지마다 직접 클릭 테스트 시간이 필요함을 알림

---

## 절대 원칙
1. 동작이 바뀌면 안 된다. 사용자 입장에서 "보이는 모양"만 바뀐다.
2. 한 번에 한 페이지, 한 섹션씩.
3. 의심스러우면 멈추고 질문한다. 추측해서 고치지 않는다.

---

## Phase 0 — 디자인 토큰 추출 (READ-ONLY)
참조 페이지와 그 페이지가 import하는 스타일 파일만 읽는다. **아무 파일도 수정하지 않는다.**

추출 항목:
- 색상 팔레트 (primary / secondary / bg / text 단계별)
- 타이포그래피 (font-family, size 스케일, weight, line-height)
- 간격(spacing) 스케일
- border-radius, shadow, border
- 레이아웃 패턴 (container width, grid, padding 규칙)
- 컴포넌트 패턴 (버튼 / 카드 / 입력 필드의 공통 클래스 조합)
- transition / animation 규칙

산출물: `.design-system.md` (프로젝트 루트). 출력하고 **여기서 멈춘다.**  
질문: "토큰 맞나요? 빠진 게 있나요?"  
승인 받기 전엔 다음 페이즈로 안 간다.

---

## Phase 1 — 대상 페이지 기능 인벤토리 (READ-ONLY)
첫 번째 대상 페이지를 읽고 **절대 깨지면 안 되는 것들**을 목록화:

- 모든 `useState` / `useReducer` / 외부 상태 (Zustand, Redux, Context)
- 모든 이벤트 핸들러 (onClick, onChange, onSubmit, ...)
- 모든 API 호출 / 데이터 fetching 훅 (useQuery, useSWR, fetch, axios)
- 모든 라우팅 (Link, navigate, redirect)
- 모든 조건부 렌더링의 **조건식**
- form 검증 로직
- props 인터페이스, 자식 컴포넌트에 넘기는 props
- testid / role / aria-* 
- key prop

산출물: 채팅에 인벤토리 출력 + "빠진 거 있나요? 이 페이지에서 특히 신경 쓸 동작이 있나요?" 질문.  
답 받기 전엔 진행 안 함.

---

## Phase 2 — 디자인 적용 (한 페이지, 한 섹션씩)

### 바꿔도 되는 것
- className 문자열 (Tailwind 클래스, CSS 모듈 클래스명)
- styled-components / CSS-in-JS 스타일 값
- 인라인 style 객체
- **순수 시각적 래퍼 div/span 추가** (이벤트 위임 / ref 전달에 영향 없는 경우만)
- SVG 아이콘 교체 (같은 의미일 때만)
- 색상 / 간격 / 폰트 토큰 적용
- 호버 / 포커스 / transition 효과

### 절대 건드리지 말 것
- 컴포넌트 prop 이름·타입·시그니처
- 상태 변수, setState 호출
- 이벤트 핸들러 함수 **본문**
- API 엔드포인트, fetch/axios 호출
- 라우터 경로, navigate 인자
- 조건부 렌더링의 **조건식** (`{isLoggedIn && ...}`의 `isLoggedIn`)
- form 검증 로직
- hook 호출 순서, 의존성 배열
- key prop, testid, role, aria-*

### 작업 방식
1. 섹션 단위로 수정 (header → main content → footer 순)
2. 각 섹션 수정 후 `git diff` 노출
3. 스스로 점검: "스타일 외에 바뀐 줄이 있나?"
4. 의심 케이스 → **멈추고 질문**

---

## Phase 3 — 자체 검증
- Phase 1 인벤토리 항목 전부 살아있나? (각 항목 ✅/❌ 체크)
- import 문 변동 사항? (추가/제거된 것 명시)
- 새 의존성 도입했나? (있으면 명시)
- `tsc --noEmit` / `npm run build` 통과?
- lint 통과?

하나라도 실패 → 롤백 또는 수정 후 재검증. 사용자에게 보고.

---

## Phase 4 — 사용자 수동 확인 게이트
자체 검증 통과해도 끝 아님. 사용자에게:
- "이 페이지의 핵심 동작 X, Y, Z를 직접 클릭 테스트해주세요"
- 통과 → `git commit -m "design: port <참조> style to <대상>"` 후 다음 페이지
- 실패 → 어디가 어떻게 깨졌는지 받아서 수정

---

## Phase 5 — 다음 페이지 또는 종료
OK 받으면 다음 대상 페이지로 가서 **Phase 1부터 반복**.  
모든 페이지 끝나면 종료 리포트:
- 페이지별 변경 요약
- 새로 도입한 토큰/패턴
- 후속 작업 제안 (공통 컴포넌트화 가능 지점 등)

---

## 즉시 멈춤 신호 (질문 후 진행)
다음 중 하나라도 나타나면 **즉시 멈추고 사용자에게 묻는다**:
- 디자인 통일을 위해 컴포넌트를 분리/통합해야 할 것 같을 때
- 참조와 대상의 정보 구조가 다를 때 (참조: 정적 3개 가정, 대상: 동적 N개)
- props 시그니처를 바꿔야 할 것 같을 때
- 새 라이브러리(아이콘 팩, 애니메이션) 설치가 필요할 때
- 같은 기능 코드가 여러 군데 있어 어디 기준으로 맞춰야 할지 모를 때
- 참조 페이지의 스타일이 대상 페이지의 접근성 요구를 깨뜨릴 것 같을 때