# 출시 TODO — gongnori.fan

> 기준: 2026-06-16 세션. 순서 = 내부 베타(~50명 + 대회) → 공개 오픈.
> 표기: **⟶내가** = Claude가 코드로 처리 가능 / 나머지는 직접(대시보드·계정·결정).

> ⭐ 2026-07-23 이후의 최우선 로드맵은 **`FEATURES.md`** (월드컵 종료 후 작성)에서 관리 — F15·F16 참조.

## A. 베타 시작 전 — 꼭 🔴
1. ✅ **크론 살아있나 확인** (2026-06-16 완료) — Vultr fetch-results 밤새 15분마다 0에러 + DB 스코어 착지(완료 14경기, 스코어 NULL 0, 축구 1X2 정합성 100%) 검증.
2. **대회 풀 플로우 테스트** — 테스트 계정 2~3개로 등록→참여→점수→결과 완주 (50명 오기 전 버그 잡기)
3. **Sentry 알림 받기** — 폰에 Sentry 앱 설치+로그인+알림 허용 / Alerts "new issue" 룰 확인 / 테스트 이슈 Resolve

## B. 베타 운영
4. **soft launch** — 지인 ~50명 오픈 → Vercel Logs + Sentry 보며 관찰
5. **롤백 숙지** — Vercel "Promote previous deployment" (사고 시 30초 복구)

## C. 인스타그램 연동 (선택, 블로커 아님)
- 현재 IG 임베드는 fallback으로 동작 중. **공식 oEmbed로 강화** 시 (Meta 쪽 작업):
6. Meta(페이스북) 개발자 앱 생성 → **비즈니스 인증**(사업자 서류) → **oEmbed Read 권한 앱 심사** → 액세스 토큰 발급 → Vercel env `FACEBOOK_ACCESS_TOKEN` 추가 **⟶내가(코드 연결)**
- ⚠️ Meta 심사+비즈인증이 관문이라 시간 걸림. 베타엔 불필요.

## D. 공개 오픈 때 (베타 후)
7. **Google Search Console + 네이버 서치어드바이저** 등록 **⟶내가(인증 메타태그)**
8. **CSP 완전 강화** **⟶내가(nonce 구현 + preview 검증)**
9. **소셜 로그인(네이버/카카오)** — Clerk 네이티브 미지원 → **연동 가능 여부부터 확인** 필요

## E. 나중 / 사업
10. **결제** → 언론사 계약 후 (사업자등록 + 통신판매업)
11. **본인인증(다날)** → 대회 공정성/연령제한 필요할 때만
12. (위생) Vercel 비밀 env "Sensitive" 표시 / Supabase PITR(트래픽 후) / 클라 Sentry 켜기(브라우저 에러 수집 원하면) **⟶내가**

## 이번 세션 완료 (참고)
- ✅ 보안 하드닝 마이그레이션(적용+배포): RLS·함수 권한
- ✅ SSRF 가드(`/api/og`) + 취약 패키지 패치(sanitize-html 등)
- ✅ 사이트 카피 전면 개정
- ✅ Vercel env 점검 / Firewall(Bot Protection·AI Bots ON) / Supabase 일일백업 / Sentry 연결+검증
- ✅ SSL 자동(Let's Encrypt) 확인
