// Shared writing logic for the admin practice runner and the live CLI. No filesystem access.
export function createAggWriter(CONFIG, WRITE_MODEL, BASE_PROMPT) {
  const SITE_ORIGIN = "https://gongnori.fan"
  const MAX_VISION_IMAGES = 3
  const MAX_FEWSHOT = 8
  const STRUCTURES = ["photo_blurb", "one_point", "short_read", "number_hook"]
  /** 소재 → 페르소나 배정 (topics/카테고리 키워드 매칭, 없으면 유머 담당) */
  function pickPersona(item) {
    const text = `${item.source_title || ""} ${item.category || ""}`.toLowerCase()
    let best = null
    let bestScore = 0
    for (const p of CONFIG.personas) {
      const score = (p.topics || []).reduce(
        (s, t) => (text.includes(t.toLowerCase()) ? s + 1 : s),
        0
      )
      if (score > bestScore) {
        bestScore = score
        best = p
      }
    }
    return (
      best || CONFIG.personas.find((p) => p.userId === "user_persona_meme") || CONFIG.personas[0]
    )
  }

  /** 구조 룰렛 — 이미지 많으면 photo_blurb 가중, 아니면 랜덤. seed 로 재현 가능 */
  function pickStructure(item, rnd = Math.random) {
    const imgCount = (item.media || []).filter((m) => m.type === "image").length
    if (imgCount >= 3 && rnd() < 0.5) return "photo_blurb"
    return STRUCTURES[Math.floor(rnd() * STRUCTURES.length)]
  }

  /** few-shot 렌더 — 최근 교정 쌍 + 반려 소재 신호를 프롬프트 예시로 */
  function renderFewshot(corrections) {
    const out = []
    const pairs = (corrections.pairs || []).slice(-MAX_FEWSHOT)
    if (pairs.length > 0) {
      const blocks = pairs.map((p, i) => {
        const beforeBody = (p.before?.paragraphs || []).join(" / ")
        const afterBody = (p.after?.paragraphs || []).join(" / ")
        return [
          `### 교정 예시 ${i + 1}${p.persona ? ` (페르소나: ${p.persona})` : ""}`,
          `✗ 이렇게 쓰면 안 됨:`,
          `  제목: ${p.before?.title || ""}`,
          `  본문: ${beforeBody}`,
          `✓ 이렇게 고쳐야 함:`,
          `  제목: ${p.after?.title || ""}`,
          `  본문: ${afterBody}`,
          p.note ? `  메모: ${p.note}` : "",
        ]
          .filter(Boolean)
          .join("\n")
      })
      out.push("", "## 교정 학습 예시 (운영자가 직접 고친 것 — 같은 실수 반복 금지)", ...blocks)
    }
    const rejects = (corrections.rejects || []).slice(-MAX_FEWSHOT)
    if (rejects.length > 0) {
      const rlist = rejects.map(
        (r) => `- "${r.source_title}"${r.reason ? ` — 이유: ${r.reason}` : ""}`
      )
      out.push(
        "",
        '## 반려된 소재 유형 (운영자가 "이런 건 쓰지 말라"고 지정 — 유사하면 decision=reject)',
        ...rlist
      )
    }
    return out.join("\n")
  }

  /** 시스템 프롬프트 (few-shot 주입 완료본) */
  /** @param {import('./agg-corrections.mjs').Corrections} corrections */
  function buildSystemPrompt(corrections = { pairs: [], rejects: [] }) {
    const base = BASE_PROMPT
    return base.replace("<!-- FEWSHOT -->", renderFewshot(corrections))
  }

  /** OpenAI messages 조립. catchphrase 는 30% 확률로만 노출 — 매 글 꼬리표로 붙는 스팸 방지 (모델은 입력에 있으면 못 참는다) */
  function buildMessages({ item, persona, structure, systemPrompt, rnd = Math.random }) {
    const input = {
      source_title: item.source_title,
      category: item.category,
      excerpt: (item.body_excerpt || "").slice(0, 1400),
      media_types: [...new Set((item.media || []).map((m) => m.type))],
      structure,
      persona: {
        nickname: persona.nickname,
        tone: persona.tone,
        topics: persona.topics,
        catchphrases: rnd() < 0.3 ? persona.catchphrases : [],
        avoid: persona.avoid,
        sentenceHabit: persona.sentenceHabit,
        angleStyle: persona.angleStyle,
      },
    }
    const imageUrls = (item.media || [])
      .filter((m) => m.type === "image" && m.rehosted_url)
      .slice(0, MAX_VISION_IMAGES)
      .map((m) => `${SITE_ORIGIN}${m.rehosted_url}`)
    return [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: [
          { type: "text", text: JSON.stringify(input) },
          ...imageUrls.map((url) => ({ type: "image_url", image_url: { url } })),
        ],
      },
    ]
  }

  /** 한 건 생성 → {decision, angle, title, paragraphs, reject_reason} */
  async function generatePost({ item, persona, structure, systemPrompt, chatWithRetry }) {
    const messages = buildMessages({ item, persona, structure, systemPrompt })
    const response = await chatWithRetry({
      model: WRITE_MODEL,
      messages,
      response_format: { type: "json_object" },
      temperature: 0.85,
      max_tokens: 700,
    })
    const out = JSON.parse(response.choices[0].message.content)
    out.paragraphs = Array.isArray(out.paragraphs)
      ? out.paragraphs.map((p) => String(p).trim()).filter(Boolean)
      : []
    return out
  }

  return { pickPersona, pickStructure, buildMessages, generatePost, buildSystemPrompt }
}
