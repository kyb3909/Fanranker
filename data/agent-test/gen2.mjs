import { readFileSync, writeFileSync } from 'fs'

const API_KEY = process.env.LLM_API_KEY
const BASE_URL = process.env.LLM_BASE_URL
const MODEL = process.env.LLM_MODEL

const personas = JSON.parse(readFileSync('personas.json', 'utf-8')).personas
const plan = JSON.parse(readFileSync('content-plan.json', 'utf-8'))
let posts = []
try { posts = JSON.parse(readFileSync('generated-posts.json', 'utf-8')) } catch {}
const done = new Set(posts.map(p => `${p.persona_id}_${p.index}`))
console.log(`Existing: ${posts.length}, generating remaining...`)

const EMBEDS = {
  youtube: ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'https://www.youtube.com/watch?v=9bZkp7q19f0', 'https://www.youtube.com/watch?v=kJQP7kiw5Fk'],
  x: ['https://x.com/elikiio/status/1925879461115654306', 'https://x.com/FCBarcelona/status/1879858498305835258'],
  instagram: ['https://www.instagram.com/p/DFm0LV0sHJK/', 'https://www.instagram.com/reel/DFUfF7NviYz/'],
}
const pick = a => a[Math.floor(Math.random() * a.length)]

let count = 0
for (const pp of plan.post_allocation.plan) {
  const persona = personas.find(x => x.persona_id === pp.persona_id)
  for (let i = 0; i < pp.posts.length; i++) {
    if (done.has(`${persona.persona_id}_${i}`)) continue
    const post = pp.posts[i]
    const eu = post.has_embed ? pick(EMBEDS[post.has_embed]) : null
    const prompt = `You are "${persona.nickname}". Role:${persona.role_type}. Write Korean post for "${post.community}". Theme:${post.theme}. Hint:${post.title_hint}${eu ? '. URL:' + eu : ''}. Length:${persona.writing_style.length}. Respond JSON only: {"title":"...","content":"..."}`

    console.log(`  ${persona.persona_id} #${i}...`)
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const r = await fetch(`${BASE_URL}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
          body: JSON.stringify({ model: MODEL, messages: [{ role: 'user', content: prompt }], temperature: 0.85, max_tokens: 2000 }),
        })
        if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`)
        const d = await r.json()
        const raw = d.choices[0].message.content

        // Extract title and content via regex
        const titleRe = /"title"\s*:\s*"((?:[^"\\]|\\.)*)"/s
        const contentRe = /"content"\s*:\s*"((?:[^"\\]|\\.)*)"/s
        const tm = raw.match(titleRe)
        const cm = raw.match(contentRe)
        if (!tm) throw new Error('No title in: ' + raw.substring(0, 80))

        const title = tm[1].replace(/\\n/g, '\n').replace(/\\"/g, '"')
        const content = cm ? cm[1].replace(/\\n/g, '\n').replace(/\\"/g, '"') : title

        posts.push({ persona_id: persona.persona_id, user_id: `test_agent_${persona.persona_id}`, index: i, title, content, community_slug: post.community, embed_url: eu, embed_platform: post.has_embed || null })
        writeFileSync('generated-posts.json', JSON.stringify(posts, null, 2))
        count++
        console.log(`[${posts.length}/100] ${title.substring(0, 50)}`)
        break
      } catch (e) {
        console.error(`  retry ${attempt}: ${e.message.substring(0, 100)}`)
        if (attempt === 2) console.error(`[FAIL] ${persona.persona_id} #${i}`)
      }
    }
  }
}
console.log(`\nDone: ${count} new (total: ${posts.length})`)
process.exit(0)
