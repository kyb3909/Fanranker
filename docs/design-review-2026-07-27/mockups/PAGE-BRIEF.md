# 페이지 확장 목업 — 공용 브리프 (시안 A "매치데이")

운영자 결정: **시안 A 채택**. 나머지 페이지도 A의 비주얼 언어로 통일한다.

## ⚠️ 최우선 원칙 — 구조는 그대로, 스킨만 바꾼다

운영자 지시 원문: *"나는 지금 와이어프레임 구조가 기능적으로 딱 UI UX적으로 이용하기 편하고 기능들을 정리해서 몰아 넣은거라 최대한 활용했으면 좋겠어."*

즉 **정보 구조(IA)·레이아웃 골격·기능 배치·동선을 바꾸지 말 것.**
- 컬럼 구성(메인/사이드바 비율), 섹션 순서, 탭 구성, 버튼 위치, 기능 묶음은 현재 그대로 유지
- 바꾸는 것은 **표면**뿐: 컬러·타이포·간격 리듬·카드 표현·상태 표현·다크 존 도입·카피 톤
- 기능을 빼거나 새 기능을 발명하지 말 것. 현재 화면에 있는 요소는 전부 목업에도 존재해야 함
- 구조 개선 아이디어가 있으면 HTML 맨 아래 `<!-- 제안: ... -->` 주석으로만 남길 것

## 필수 준수

1. **공용 CSS 링크**: `<link rel="stylesheet" href="_a-system.css" />` — 토큰·GNB·푸터·카드·픽버튼·칩·탭이 이미 정의돼 있다. 페이지 전용 CSS만 `<style>`로 추가.
2. **폰트 로드** (head에):
   ```html
   <link rel="preconnect" href="https://fonts.googleapis.com" />
   <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
   <link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700;800&family=Nanum+Brush+Script&display=swap" rel="stylesheet" />
   <link rel="stylesheet" as="style" crossorigin href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" />
   ```
3. **GNB / 푸터 / 모바일 하단 탭**은 A(a-matchday.html)와 동일 마크업으로 복제 — 페이지 간 이동해도 헤더·푸터가 흔들리면 안 된다. 현재 페이지의 GNB 항목에 `class="on"`.
   - GNB: 담벼락 · 운동장 · 승부예측 / 우측 검색·알림 아이콘 + 아바타
   - GNB 링크는 실제 목업 파일로 연결: 담벼락→`a-matchday.html`, 승부예측→`p-prediction.html`, 운동장→`p-stadium.html`
4. **🚫 절대 금지**: 어떤 요소에도 한쪽 면 색깔 액센트 보더/바 (`border-left: 3px solid …` 류). 위계는 배경 틴트·칩·타이포 웨이트·전체 테두리 색으로만. **위반 시 작업 폐기됨.**
5. **배당률 숫자 UI 노출 금지** (정책). 픽 버튼은 팀명만. 배점은 슬립에서만.
6. **LIVE 라임(`--live`)은 페이지당 1곳 이하.**
7. 자체 완결 HTML 1파일 + 공용 CSS 링크. JS는 상태 데모 수준만(탭 전환·선택 토글).
8. 데스크톱 1280px 기준 + `@media (max-width: 860px)` 모바일 대응.

## A의 다크 존 적용 규칙 (페이지마다 어디에 쓸지 판단)

- **다크 밴드**: 페이지 정체성을 선언하는 상단 영역 1개 (`.band` 클래스 사용). 모든 페이지에 무리하게 넣지 말 것 — 그 페이지의 "주인공"이 있을 때만.
- **다크 액션 존**: 돈/픽이 걸린 인터랙션 영역 (픽 버튼, 슬립)
- **다크 푸터**: 전 페이지 공통
- 본문·긴 글·폼은 **라이트 유지** (가독성)

## 카피 톤

테라스 말투 — "오늘 밤 픽 걸어", "떡밥 더 물기", "누가 살아남았나 봐라".
단 **돈이 확정되는 단계(슬립 제출 확인·정산·환불·결제)는 표준 문장** 유지.

## 브랜드 상수

- 로고: 붓글씨 `그깟 공놀이` + `gongnori.fan`
- 버건디 `#961e37`, 슬로건 "그깟 공놀이에 진심인 팬들의 놀이터"
- 봇/유저 닉네임 예시: 몽몽이, 경기 프리뷰, 공놀이봇
