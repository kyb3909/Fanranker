/**
 * Standalone content generator — No Supabase dependency
 * Generates 100 posts via Gemini API and saves to generated-posts.json
 *
 * Usage: node generate-content.js
 */

import 'dotenv/config'
import { readFileSync, writeFileSync } from 'fs'

const LLM_API_KEY = process.env.LLM_API_KEY
const LLM_BASE_URL = process.env.LLM_BASE_URL || 'https://api.openai.com/v1'
const LLM_MODEL = process.env.LLM_MODEL || 'gemini-2.0-flash'

if (!LLM_API_KEY) {
  console.error('Missing LLM_API_KEY in .env')
  process.exit(1)
}

const personas = JSON.parse(readFileSync(new URL('./personas.json', import.meta.url), 'utf-8')).personas
const contentPlan = JSON.parse(readFileSync(new URL('./content-plan.json', import.meta.url), 'utf-8'))

const EMBED_URLS = {
  youtube: [
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://www.youtube.com/watch?v=jNQXAC9IVRw',
    'https://www.youtube.com/watch?v=9bZkp7q19f0',
    'https://www.youtube.com/watch?v=kJQP7kiw5Fk',
    'https://youtu.be/L_jWHffIx5E',
  ],
  x: [
    'https://x.com/elikiio/status/1925879461115654306',
    'https://x.com/FCBarcelona/status/1879858498305835258',
    'https://x.com/OptaJoe/status/1925469303650586847',
  ],
  instagram: [
    'https://www.instagram.com/p/DFm0LV0sHJK/',
    'https://www.instagram.com/reel/DFUfF7NviYz/',
    'https://www.instagram.com/p/DGFq8vqP3tB/',
  ],
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

async function llmCall(prompt, maxTokens = 1000) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 30000)

  try {
    const res = await fetch(`${LLM_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LLM_API_KEY}`,
      },
      body: JSON.stringify({
        model: LLM_MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.85,
        max_tokens: maxTokens,
      }),
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!res.ok) {
      const errBody = await res.text()
      throw new Error(`HTTP ${res.status}: ${errBody.substring(0, 200)}`)
    }

    const data = await res.json()
    const raw = data.choices[0].message.content.trim()
    const cleaned = raw.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim()
    const jsonStr = cleaned.startsWith('{') ? cleaned : cleaned.match(/\{[\s\S]*\}/)?.[0] || cleaned
    return JSON.parse(jsonStr)
  } catch (err) {
    clearTimeout(timeoutId)
    throw err
  }
}

async function generatePost(persona, postPlan) {
  const embedUrl = postPlan.has_embed ? pickRandom(EMBED_URLS[postPlan.has_embed]) : null

  const prompt = `You are "${persona.nickname}", a Korean community user.
Role: ${persona.role_type}
Writing style: ${JSON.stringify(persona.writing_style)}
Opinion bias: ${JSON.stringify(persona.opinion_bias)}

Write a community post for the "${postPlan.community}" board.
Theme: ${postPlan.theme}
Title hint: ${postPlan.title_hint}

${embedUrl ? `IMPORTANT: Include this URL naturally in the post body: ${embedUrl}` : ''}

Rules:
- Write in Korean
- Match your persona's tone and style exactly
- Content must be substantive (NOT generic filler)
- Use signature phrases occasionally
- Length: ${persona.writing_style.length}
- Emoji: ${persona.writing_style.emoji}

Respond with ONLY a JSON object: {"title": "...", "content": "..."}`

  const result = await llmCall(prompt, 1000)
  return {
    ...result,
    community_slug: postPlan.community,
    embed_url: embedUrl,
    embed_platform: postPlan.has_embed || null,
  }
}

async function main() {
  console.log(`Content Generator — Model: ${LLM_MODEL}`)
  console.log(`Personas: ${personas.length}, Total posts to generate: 100\n`)

  // Load existing progress if any
  let allPosts = []
  try {
    allPosts = JSON.parse(readFileSync(new URL('./generated-posts.json', import.meta.url), 'utf-8'))
    console.log(`Resuming from ${allPosts.length} existing posts\n`)
  } catch {
    // Fresh start
  }

  const completedKeys = new Set(allPosts.map(p => `${p.persona_id}_${p.index}`))

  let globalIndex = allPosts.length
  let errors = 0

  for (const personaPlan of contentPlan.post_allocation.plan) {
    const persona = personas.find(p => p.persona_id === personaPlan.persona_id)
    console.log(`\n[${persona.persona_id}] ${persona.nickname} — ${personaPlan.posts.length} posts`)

    for (let i = 0; i < personaPlan.posts.length; i++) {
      const key = `${persona.persona_id}_${i}`
      if (completedKeys.has(key)) {
        console.log(`  [${i + 1}/10] skip (already generated)`)
        continue
      }

      const postPlan = personaPlan.posts[i]
      let retries = 3

      while (retries > 0) {
        try {
          const generated = await generatePost(persona, postPlan)
          allPosts.push({
            persona_id: persona.persona_id,
            user_id: `test_agent_${persona.persona_id}`,
            index: i,
            ...generated,
          })

          console.log(`  [${i + 1}/10] "${generated.title.substring(0, 50)}"`)

          // Save after every post (crash recovery)
          writeFileSync(
            new URL('./generated-posts.json', import.meta.url),
            JSON.stringify(allPosts, null, 2)
          )

          globalIndex++
          break // success
        } catch (err) {
          retries--
          errors++
          console.error(`  [${i + 1}/10] ERROR: ${err.message} (${retries} retries left)`)
          if (retries > 0) {
            await new Promise(r => setTimeout(r, 3000))
          }
        }
      }

      // Small delay between calls
      await new Promise(r => setTimeout(r, 1500))
    }
  }

  console.log(`\n=== Done ===`)
  console.log(`Generated: ${allPosts.length}/100 posts`)
  console.log(`Errors: ${errors}`)
  console.log(`Saved to: generated-posts.json`)

  process.exit(0) // Force clean exit
}

main()
