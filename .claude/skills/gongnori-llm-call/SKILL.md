---
name: gongnori-llm-call
description: OpenAI 호출 코드를 쓰거나 고칠 때, 모델 문자열(gpt-4o-mini / gpt-5.1 / gpt-5.6-terra 등)을 바꿀 때, 요청 본문에 temperature·top_p·max_tokens 를 넣을 때, api.openai.com/v1/chat/completions 로 fetch 하는 코드를 만질 때, lib/news·lib/saga·lib/naming·scripts/vps-news-scanner 안의 LLM 호출을 수정할 때 쓴다. 모델 요금이나 토큰 비용을 계산할 때도 쓴다.
allowed-tools: Read, Edit, Grep, Bash
---

# OpenAI 호출 규약

## 반드시

요청 본문의 모델·샘플링 파라미터는 **`...chatParams(model, {...})` 로만** 만든다.

```ts
body: JSON.stringify({
  ...chatParams(MODEL, { temperature: 0, max_tokens: 800 }),
  response_format: { type: "json_object" },
  messages: [...],
})
```

직접 `temperature:` 를 적으면 모델을 바꾸는 순간 400 이 난다. 그리고 이 파이프라인
상당수가 fail-closed 라서 **에러 없이 발행이 멈춘다** — 검증이 400 이면 "검증 실패 =
전건 보류"가 되기 때문이다. 증상이 안 보이는 고장이라 이 규약이 있다.

실측 근거(2026-08-09 프로브)는 `lib/llm/openai-params.ts` 상단 주석에 있다. 요약:
`gpt-5.6-terra` 는 `temperature`(≠1)·`top_p`·`max_tokens` 를 전부 400 으로 거부하고
`max_completion_tokens` 를 요구한다.

## 구현이 두 벌이다

| 자리 | 파일 |
|---|---|
| 정본 | `lib/llm/openai-params.ts` |
| 복제본 | `scripts/vps-news-scanner/news-scanner.mjs` (65행 근처) |

복제본이 있는 이유: 스캐너는 **무의존 단일 파일**이라 `@/lib/...` 를 import 할 수 없다.
VPS 에 파일 하나만 올려 돌리는 배포 단위다.

**한쪽을 고치면 반드시 양쪽을 고친다.** 실제로 갈라져 있었다(2026-08-26 발견):
복제본이 `temperature`·`max_tokens` 만 구조분해하고 나머지를 **두 경로 모두에서 조용히
버렸다**. `top_p` 를 넘기는 호출부가 아직 없어서 사고는 안 났을 뿐이다.

갈라지면 `__tests__/lib/llm/openai-params-vps-sync.test.ts` 가 실패한다. 주석은 사람이
읽어야 지켜지지만 이 시험은 안 읽어도 걸린다.

```bash
pnpm vitest run __tests__/lib/llm/
```

복제본을 고쳤으면 VPS 에 배포해야 실제로 반영된다 (base64 경유 — SFTP 는 막혀 있다).

## 모델 요율

`lib/news/assignment-desk.ts` 의 `MODEL_RATES_USD_PER_MTOK`. 새 모델을 도입하면
여기도 추가해야 비용 집계가 맞는다.
