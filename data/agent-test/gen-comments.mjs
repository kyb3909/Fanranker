import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync } from 'fs'

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const API_KEY = process.env.LLM_API_KEY
const BASE_URL = process.env.LLM_BASE_URL
const MODEL = process.env.LLM_MODEL

const personas = JSON.parse(readFileSync('personas.json', 'utf-8')).personas
const plan = JSON.parse(readFileSync('content-plan.json', 'utf-8'))
const pick = a => a[Math.floor(Math.random() * a.length)]

// Fetch all test posts from DB
const { data: dbPosts } = await supabase
  .from('posts')
  .select('id, user_id, title, community_slug, content')
  .like('user_id', 'test_agent_%')
  .order('created_at')

console.log(`Loaded ${dbPosts.length} test posts from DB`)

// Extract text preview from tiptap content
function getPreview(content) {
  if (!content?.content) return ''
  return content.content
    .filter(n => n.type === 'paragraph')
    .map(n => n.content?.map(c => c.text).join('') || '')
    .join(' ')
    .substring(0, 150)
}

async function llm(prompt) {
  const r = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({ model: MODEL, messages: [{ role: 'user', content: prompt }], temperature: 0.9, max_tokens: 500 }),
  })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  const d = await r.json()
  return d.choices[0].message.content.trim()
}

// Track comments for threading
const allComments = [] // { id, post_id, persona_id, content }
let commentCount = 0, failCount = 0

// Phase 1: Generate top-level comments (200)
console.log('\n=== Phase 1: Top-level comments ===')
for (const persona of personas) {
  const userId = `test_agent_${persona.persona_id}`
  const strategy = plan.comment_allocation.strategy[persona.persona_id]
  const targetPosts = dbPosts
    .filter(p => p.user_id !== userId)
    .sort(() => Math.random() - 0.5)
    .slice(0, 20)

  console.log(`\n  ${persona.nickname} (${persona.persona_id}): 20 comments`)

  for (let i = 0; i < 20; i++) {
    const post = targetPosts[i % targetPosts.length]
    const preview = getPreview(post.content)
    const prompt = `You are "${persona.nickname}". Role:${persona.role_type}. Conflict tendency:${persona.conflict_tendency}. Style:${JSON.stringify(persona.writing_style)}.
Comment on this post in "${post.community_slug}": "${post.title}"
Post content: "${preview}"
Rules: Korean only, match persona tone, reference the topic (at least 1 keyword from the post), NO generic comments like "좋은 글이네요" unless newbie. Length:${persona.writing_style.length}.
${persona.conflict_tendency > 0.5 ? 'You MAY disagree. Use: claim -> reasoning -> question format.' : ''}
Reply with just the comment text, no JSON, no quotes.`

    try {
      const content = await llm(prompt)
      const clean = content.replace(/^["']|["']$/g, '').trim()

      const { data, error } = await supabase.from('comments').insert({
        post_id: post.id, user_id: userId, content: clean,
      }).select('id').single()

      if (error) throw error
      allComments.push({ id: data.id, post_id: post.id, persona_id: persona.persona_id, content: clean.substring(0, 100) })
      commentCount++
      if (commentCount % 10 === 0) console.log(`    [${commentCount}] ${clean.substring(0, 50)}`)
    } catch (e) {
      console.error(`    FAIL: ${e.message.substring(0, 80)}`)
      failCount++
    }
    // 10s cooldown for same user
    await new Promise(r => setTimeout(r, 11000))
  }
}

// Phase 2: Threaded replies / debates (100)
console.log('\n=== Phase 2: Threaded replies & debates ===')

// Debate arcs
const debateTopics = [
  { topic: 'EPL vs 라리가', participants: ['P01','P03','P06','P10'], minReplies: 4 },
  { topic: '스포츠 통계 유용성', participants: ['P01','P04','P06','P10','P02'], minReplies: 3 },
  { topic: 'e스포츠 미래', participants: ['P04','P08','P10','P06'], minReplies: 3 },
]

// Find posts related to debate topics
for (const arc of debateTopics) {
  const triggerPost = dbPosts.find(p =>
    (arc.topic.includes('EPL') && p.title.includes('EPL')) ||
    (arc.topic.includes('통계') && (p.title.includes('통계') || p.title.includes('WAR') || p.title.includes('xG'))) ||
    (arc.topic.includes('e스포츠') && (p.title.includes('e스포츠') || p.title.includes('황금기')))
  )
  if (!triggerPost) continue

  console.log(`\n  Debate: "${arc.topic}" on "${triggerPost.title.substring(0, 40)}"`)
  let parentId = null

  for (let round = 0; round < arc.minReplies + 2; round++) {
    const pid = arc.participants[round % arc.participants.length]
    const persona = personas.find(p => p.persona_id === pid)
    const userId = `test_agent_${pid}`
    const lastComment = parentId ? allComments.find(c => c.id === parentId) : null

    const prompt = `You are "${persona.nickname}". Role:${persona.role_type}. Conflict:${persona.conflict_tendency}. Style:${JSON.stringify(persona.writing_style)}.
DEBATE on "${arc.topic}" in post "${triggerPost.title}".
${lastComment ? `Replying to: "${lastComment.content}"` : `Starting debate on this topic.`}
${round > 0 ? 'You MUST disagree or add a different perspective. Use: claim -> reasoning -> question.' : ''}
Rules: Korean only, be passionate but logical, reference specific points.
Reply with just the comment text.`

    try {
      const content = await llm(prompt)
      const clean = content.replace(/^["']|["']$/g, '').trim()

      const { data, error } = await supabase.from('comments').insert({
        post_id: triggerPost.id, user_id: userId, content: clean, parent_id: parentId,
      }).select('id').single()

      if (error) throw error
      allComments.push({ id: data.id, post_id: triggerPost.id, persona_id: pid, content: clean.substring(0, 100) })
      parentId = data.id
      commentCount++
      console.log(`    [${round + 1}] ${persona.nickname}: ${clean.substring(0, 60)}`)
    } catch (e) {
      console.error(`    FAIL: ${e.message.substring(0, 80)}`)
      failCount++
    }
    await new Promise(r => setTimeout(r, 11000))
  }
}

// Phase 2b: Random threaded replies to fill up to 300
const remaining = 300 - commentCount
console.log(`\n  Random threaded replies: ${remaining} more needed`)

for (let i = 0; i < remaining && i < 120; i++) {
  const persona = personas[i % personas.length]
  const userId = `test_agent_${persona.persona_id}`
  // Pick a random existing comment to reply to (not own)
  const candidates = allComments.filter(c => c.persona_id !== persona.persona_id)
  if (candidates.length === 0) continue
  const target = pick(candidates)

  const prompt = `You are "${persona.nickname}". Role:${persona.role_type}. Conflict:${persona.conflict_tendency}. Style:${JSON.stringify(persona.writing_style)}.
Replying to comment: "${target.content}"
${persona.conflict_tendency > 0.6 ? 'You disagree. Argue back!' : 'You add your perspective.'}
Rules: Korean only, reference what they said, be specific. Length:${persona.writing_style.length}.
Reply with just the comment text.`

  try {
    const content = await llm(prompt)
    const clean = content.replace(/^["']|["']$/g, '').trim()

    const { data, error } = await supabase.from('comments').insert({
      post_id: target.post_id, user_id: userId, content: clean, parent_id: target.id,
    }).select('id').single()

    if (error) throw error
    allComments.push({ id: data.id, post_id: target.post_id, persona_id: persona.persona_id, content: clean.substring(0, 100) })
    commentCount++
    if (commentCount % 10 === 0) console.log(`    [${commentCount}/300] ${clean.substring(0, 50)}`)
  } catch (e) {
    console.error(`    FAIL: ${e.message.substring(0, 80)}`)
    failCount++
  }
  await new Promise(r => setTimeout(r, 11000))
}

// Phase 3: Upvotes (온도 올리기)
console.log('\n=== Phase 3: Upvotes ===')
const upvoteProbs = plan.behavior_rules.reactions.upvote_probability_by_role
let upvoteCount = 0

for (const persona of personas) {
  const userId = `test_agent_${persona.persona_id}`
  const prob = upvoteProbs[persona.role_type] || 0.3
  const targets = dbPosts
    .filter(p => p.user_id !== userId)
    .filter(() => Math.random() < prob)

  for (const post of targets) {
    try {
      await supabase.from('post_votes').upsert({
        post_id: post.id, user_id: userId, vote_type: 'up',
      }, { onConflict: 'post_id,user_id' })
      upvoteCount++
    } catch {}
  }
  console.log(`  ${persona.nickname}: ${targets.length} upvotes (prob ${prob})`)
}

console.log(`\n=== Summary ===`)
console.log(`Comments: ${commentCount} (failed: ${failCount})`)
console.log(`Upvotes: ${upvoteCount}`)
console.log(`Total comments in DB: ${allComments.length}`)

// Save comment records
writeFileSync('inserted-comments.json', JSON.stringify(allComments, null, 2))
process.exit(0)
