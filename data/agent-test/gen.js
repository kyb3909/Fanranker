/**
 * Minimal post generator — no setTimeout, no sleep, pure sequential fetch
 * Usage: node gen.js
 */
import 'dotenv/config'
import { readFileSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const API_KEY = process.env.LLM_API_KEY
const BASE_URL = process.env.LLM_BASE_URL
const MODEL = process.env.LLM_MODEL

const personas = JSON.parse(readFileSync(join(__dirname, 'personas.json'), 'utf-8')).personas
const plan = JSON.parse(readFileSync(join(__dirname, 'content-plan.json'), 'utf-8'))
const outFile = join(__dirname, 'generated-posts.json')

const EMBEDS = {
  youtube: ['https://www.youtube.com/watch?v=dQw4w9WgXcQ','https://www.youtube.com/watch?v=jNQXAC9IVRw','https://www.youtube.com/watch?v=9bZkp7q19f0','https://www.youtube.com/watch?v=kJQP7kiw5Fk','https://youtu.be/L_jWHffIx5E'],
  x: ['https://x.com/elikiio/status/1925879461115654306','https://x.com/FCBarcelona/status/1879858498305835258','https://x.com/OptaJoe/status/1925469303650586847'],
  instagram: ['https://www.instagram.com/p/DFm0LV0sHJK/','https://www.instagram.com/reel/DFUfF7NviYz/','https://www.instagram.com/p/DGFq8vqP3tB/'],
}

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)] }

async function call(prompt) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(`${BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ model: MODEL, messages: [{ role: 'user', content: prompt }], temperature: 0.85, max_tokens: 2000 }),
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const d = await r.json()
      const raw = d.choices[0].message.content.trim()
      // Extract title and content via regex (handles truncated/malformed JSON)
      const titleMatch = raw.match(/"title"\s*:\s*"((?:[^"\\]|\\.)*)"/s)
      const contentMatch = raw.match(/"content"\s*:\s*"((?:[^"\\]|\\.)*)"/s)
      if (!titleMatch) throw new Error('No title found in response')
      const title = titleMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"')
      const content = contentMatch ? contentMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"') : title
      return { title, content }
    } catch (e) {
      console.error(`    retry ${attempt}: ${e.message}`)
      if (attempt === 2) throw e
    }
  }
}

// Load existing
let posts = []
try { posts = JSON.parse(readFileSync(outFile, 'utf-8')) } catch {}
const done = new Set(posts.map(p => `${p.persona_id}_${p.index}`))
console.log(`Loaded ${posts.length} existing posts, generating remaining...\n`)

let count = 0
for (const pp of plan.post_allocation.plan) {
  const persona = personas.find(p => p.persona_id === pp.persona_id)

  for (let i = 0; i < pp.posts.length; i++) {
    if (done.has(`${persona.persona_id}_${i}`)) continue

    const post = pp.posts[i]
    const embedUrl = post.has_embed ? pick(EMBEDS[post.has_embed]) : null

    const prompt = `You are "${persona.nickname}", a Korean community user.
Role: ${persona.role_type}, Writing style: ${JSON.stringify(persona.writing_style)}, Opinion bias: ${JSON.stringify(persona.opinion_bias)}
Write a community post for "${post.community}" board. Theme: ${post.theme}. Title hint: ${post.title_hint}
${embedUrl ? `Include this URL in the post: ${embedUrl}` : ''}
Rules: Korean only, match persona tone, substantive content, length=${persona.writing_style.length}, emoji=${persona.writing_style.emoji}
Respond ONLY with JSON: {"title":"...","content":"..."}`

    try {
      const result = await call(prompt)
      posts.push({
        persona_id: persona.persona_id,
        user_id: `test_agent_${persona.persona_id}`,
        index: i,
        ...result,
        community_slug: post.community,
        embed_url: embedUrl,
        embed_platform: post.has_embed || null,
      })
      writeFileSync(outFile, JSON.stringify(posts, null, 2))
      count++
      console.log(`[${posts.length}/100] ${persona.persona_id} #${i}: ${result.title?.substring(0, 50)}`)
    } catch (e) {
      console.error(`[FAIL] ${persona.persona_id} #${i}: ${e.message}`)
    }
  }
}

console.log(`\nDone: generated ${count} new posts (total: ${posts.length})`)
process.exit(0)
