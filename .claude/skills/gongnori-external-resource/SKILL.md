---
name: gongnori-external-resource
description: 외부 자원을 새로 끌어올 때 쓴다. 외부 스크립트 태그·iframe 임베드(YouTube·Instagram·X·광고)를 넣을 때, 새 도메인으로 fetch/XHR/WebSocket 을 열 때, next/image 로 새 호스트의 이미지를 띄울 때, 웹폰트를 추가할 때, next.config.mjs 의 CSP·remotePatterns 를 만질 때. "임베드", "외부 스크립트", "CSP", "이미지 호스트" 이야기가 나오면 쓴다.
allowed-tools: Read, Edit, Grep, Bash
---

# 외부 자원 추가

## 1. CSP 는 두 벌이다 — 둘 다 고친다

`next.config.mjs` 상단:

| 헤더 | 상수 | 성격 |
|---|---|---|
| `Content-Security-Policy` | `ENFORCED_CSP` | 실제로 차단한다. TipTap·광고 때문에 `unsafe-inline`/`unsafe-eval` 허용 |
| `Content-Security-Policy-Report-Only` | `STRICT_CSP_REPORT_ONLY` | 차단 안 하고 위반만 수집 |

**한 쪽만 고치면 조용히 깨지거나 조용히 통과한다.** 운영 정책만 고치면 관측이
거짓 위반을 계속 올리고, 관측만 고치면 실제로는 차단된다.

## 2. 이미지면 한 곳 더

`next.config.mjs` `images.remotePatterns` 에도 호스트를 등록한다. 지금 열려 있는 것:
YouTube · Instagram · Twitter · Supabase · Clerk avatars.

CSP 만 고치고 여기를 빠뜨리면 `next/image` 가 런타임에 거부한다.

## 3. 넣은 뒤 확인

위반은 `/api/security/csp-report` 로 들어온다. 추가 후 해당 화면을 한 번 열고
새 위반이 올라오는지 본다.

## 4. 알고 있을 것 (실측)

- **`style-src` 는 strict 로 못 간다.** React `style={{...}}` 인라인 스타일을
  광범위하게 쓰는 코드베이스라 **구조적으로 clean 해지지 않는다**. 페이지뷰마다 정확히
  5건씩 위반이 나고, 그게 Sentry 이벤트를 태워 쿼터를 먹은 적이 있다(2026-08-02).
  XSS 위험은 `script-src` 에 있으므로 strict 는 거기만 유지한다.
  → "1~2주 clean 하면 enforce 로 교체"는 `script-src` 이야기다. style 에 적용하지 말 것.
- 서드파티 임베드 스크립트는 리렌더에 사라진다. `ref` 로 붙이고 리렌더에 다시 안
  그리게 할 것 (Instagram 임베드에서 실제로 겪음).
- Vercel Bot Protection 이 켜져 있으면 OG 스크래퍼가 막힌다 — 미리보기가 비면 의심.
