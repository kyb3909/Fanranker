# 시안 공용 콘텐츠 브리프 — 모든 시안은 이 콘텐츠를 동일하게 사용한다

목적: 디자인만 다르고 콘텐츠는 같아야 시안 비교가 공정하다. 아래는 실제 사이트의 실데이터.

## 브랜드
- 로고: 붓글씨 "그깟 공놀이" + `gongnori.fan` (붓글씨는 텍스트로 대체 가능 — 손글씨 느낌 폰트 또는 굵은 표기 `그깟 공놀이`)
- 브랜드 컬러: 버건디 `#961e37` (딥: `#771629`)
- 슬로건: "그깟 공놀이에 진심인 팬들의 놀이터"
- GNB: 담벼락 · 운동장 · 승부예측 (+ 검색, 알림, 프로필 아이콘)
- 모바일 하단 탭: 담벼락 / 운동장 / 승부예측 / 글쓰기

## 오늘의 경기 (승부예측 위젯) — 배당률 숫자는 UI에 노출 금지 (일정만)
- 01:30 · MLS · 뉴욕 시티 vs 토론토 FC
- 19:00 · K리그1 · 울산 HD vs 포항 스틸러스
- 20:00 · K리그1 · FC서울 vs 전북 현대
- 03:30 · MLS · 인터 마이애미 vs LA 갤럭시
- CTA: 예측 참여 유도 (카피 톤은 시안 재량 — 단 정산·환불류 문구는 표준어)
- 배당 선택 버튼 샘플(승/무/패 3버튼, 팀명만 표시)을 어딘가에 1세트 포함할 것 — "선택됨" 상태 1개 포함

## 카드뉴스 피드 (오늘의 떡밥) — 출처 태그와 함께
1. ★David Ornstein — "토트넘, 마테우스 페르난데스 영입 경쟁에서 승리" (1티어 소스, 댓글 1: "몽몽이: 다른 기사를 보니까, 토트넘은 85m 파운드를 일시불로 준다고 하네요") — 이미지: https://cdn.bsky.app/img/feed_thumbnail/plain/did:plc:e35lo4qxz5vo6n5k3m7v5fox/bafkreih4g5kd3rh3qstews7p3j4q3omaew5jkbdcl24n6nz2iim3j3l274
2. 디 애슬레틱 — "아스날, 레알 마드리드 윙어 비니시우스 주니어 영입 탐색" — 이미지(히어로감): https://static01.nyt.com/athletic/uploads/wp/2026/07/25075335/GettyImages-2275755314-scaled-e1784980440726.jpg
3. ✓오피셜 — "첼시, 페드로 네토 판매 계획 없음" — 이미지: https://static.standard.co.uk/2025/11/18/13/15/pedro-neto.jpeg?width=1200
4. Marca — "맨체스터 시티, 얀 디오만데에 1억 유로 입찰 준비 중" — 이미지: https://objetos-xlk.estaticos-marca.com/files/article_main_microformat/uploads/2026/07/22/6a60bb3c6e939.jpeg
5. RBFA — "벨기에, 마르크 반 보멀을 새로운 국가대표팀 감독으로 임명" — 이미지: https://drupal2018.assets.rbfa.be/s3fs-public/styles/image_850x475/public/2026-07/website_mvb.jpg?VersionId=EZykAQx98Mdt1iqlKGUJyqvjLtw4GGaT&h=73cf9c8b&itok=cKhFdd8R
6. 가제타 — "이탈리아 축구 연맹, 안드레아 피를로 감독직 접촉" — 이미지: https://dimages2.gazzettaobjects.it/files/og_thumbnail/files/fp/uploads/2026/07/21/6a5fb272da411.r_d.1500-838-0.jpeg
7. ★로마노 — "로베르트 레반도프스키, 시카고 파이어 이적 확정" (텍스트만)
8. 디 애슬레틱 — "리즈, 맨체스터 시티와 제임스 트래포드 영입 협상 중" — 이미지: https://static01.nyt.com/athletic/uploads/wp/2026/07/23055800/james-trafford-mc-scaled-e1784800706287.jpg
9. Loïc Tanzi — "디오망데, PSG와 5년 계약 합의 근접" (텍스트만)
10. Yahoo — "인터 마이애미, 메시 결장 속 몬트리올 원정 승리" — 이미지: https://s.yimg.com/os/en/esteemed_kompany_articles_332/41683de89e8ef81449c3a489d5aa408c

메타 예시: 좋아요 1 · 댓글 1 · 7월 1일 (숫자 0은 숨김이 현행 규칙)

## 사이드바
- 오늘의 설문: "아스날 다음 영입 1순위는?" — 기마랑이스 / 토날리 / 마페 / 부아디
- 디스코드 배너: "축구 뉴스·매일 밤 오늘의 경기 알림을 디스코드로" (현행 blurple 금지 — 브랜드 톤으로 재해석)
- 최근 댓글 달린 게시물 3개: "월드컵 이벤트 예측 내역이 [4]", "한국 축구 빙고의 저주 7월 1일 기준 [1]", "[David Ornstein] 토트넘, 마테우스… [1]"

## 푸터
회사 소개 · 이용약관 · 게시물 운영정책 · 개인정보처리방침 + 로고 + 슬로건

## 기술 제약 (전 시안 공통)
- **자체 완결 HTML 1파일** (인라인 CSS, 빌드 불필요, 브라우저로 바로 열림)
- 웹폰트는 CDN 허용 (Google Fonts, Pretendard CDN 등)
- 이미지: 위 URL 핫링크 사용
- 데스크톱 1280px 기준 + 간단한 반응형 (max-width 100%)
- JS는 최소 (탭 전환·선택 상태 데모 정도만, 없어도 됨)
