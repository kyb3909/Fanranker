/**
 * ============================================================
 * Persona Agent Test Runner
 * ============================================================
 *
 * Usage:
 *   node runner.js --phase all        # Run everything
 *   node runner.js --phase setup      # Create personas + test users
 *   node runner.js --phase generate   # Generate content via LLM
 *   node runner.js --phase execute    # Insert into DB + test features
 *   node runner.js --phase validate   # Validate quotas
 *   node runner.js --phase report     # Generate final report
 *   node runner.js --phase cleanup    # Remove all test data
 */

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { writeFileSync } from 'fs'

// ============================================================
// Config
// ============================================================

const APP_URL = process.env.APP_URL || 'http://localhost:3000'

// Lazy-init supabase to avoid event loop interference in generate phase
let _supabase = null
function getSupabase() {
  if (!_supabase) {
    const url = process.env.SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) {
      console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
      process.exit(1)
    }
    _supabase = createClient(url, key, {
      realtime: { params: { eventsPerSecond: 0 } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }
  return _supabase
}
const LLM_MODEL = process.env.LLM_MODEL || 'gpt-4o-mini'

const personas = JSON.parse(readFileSync(new URL('./personas.json', import.meta.url), 'utf-8')).personas
const contentPlan = JSON.parse(readFileSync(new URL('./content-plan.json', import.meta.url), 'utf-8'))

// oEmbed sample URLs pool
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

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

function randomDelay(min, max) {
  return sleep(min + Math.random() * (max - min))
}

async function llmCall(messages, maxTokens = 1000, retries = 3) {
  const apiKey = process.env.LLM_API_KEY
  const baseUrl = process.env.LLM_BASE_URL || 'https://api.openai.com/v1'

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 45000)

      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: LLM_MODEL,
          messages,
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
      // Strip markdown code fences if present
      const cleaned = raw.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim()
      const jsonStr = cleaned.startsWith('{') ? cleaned : cleaned.match(/\{[\s\S]*\}/)?.[0] || cleaned
      return JSON.parse(jsonStr)
    } catch (err) {
      console.error(`    LLM attempt ${attempt}/${retries} failed: ${err.message}`)
      if (attempt < retries) {
        const wait = attempt * 5000
        console.log(`    Retrying in ${wait / 1000}s...`)
        await sleep(wait)
      } else {
        throw err
      }
    }
  }
}

// ============================================================
// Phase 1: Setup — Create personas as test users in DB
// ============================================================

async function setupPhase(runId) {
  console.log('\n=== PHASE 1: SETUP ===')

  // Register run
  await getSupabase().from('agent_runs').insert({
    run_id: runId,
    status: 'running',
    started_at: new Date().toISOString(),
    config: { personas: personas.length, total_posts: 100, total_comments: 300 },
  })

  for (const p of personas) {
    const testUserId = `test_agent_${p.persona_id}`

    // Upsert profile
    const { error: profileErr } = await getSupabase().from('profiles').upsert({
      user_id: testUserId,
      nickname: p.nickname,
      avatar_url: null,
      temperature: 36.5,
    }, { onConflict: 'user_id' })

    if (profileErr) {
      console.error(`  Profile error for ${p.persona_id}:`, profileErr.message)
    }

    // Register persona
    await getSupabase().from('agent_personas').upsert({
      persona_id: p.persona_id,
      nickname: p.nickname,
      clerk_user_id: testUserId,
      role_type: p.role_type,
      config: p,
    }, { onConflict: 'persona_id' })

    // Flag as test data
    await getSupabase().from('content_flags').upsert({
      target_type: 'profile',
      target_id: testUserId,
      is_test_data: true,
      generator: 'agent_test',
      run_id: runId,
    }, { onConflict: 'target_type,target_id' })

    console.log(`  Created persona: ${p.persona_id} (${p.nickname})`)
  }

  console.log(`Setup complete: ${personas.length} personas registered`)
}

// ============================================================
// Phase 2: Generate — LLM content generation
// ============================================================

async function generatePost(persona, postPlan, existingPosts) {
  const embedUrl = postPlan.has_embed
    ? pickRandom(EMBED_URLS[postPlan.has_embed])
    : null

  const prompt = `You are "${persona.nickname}", a Korean community user.
Role: ${persona.role_type}
Writing style: ${JSON.stringify(persona.writing_style)}
Opinion bias: ${JSON.stringify(persona.opinion_bias)}

Write a community post for the "${postPlan.community}" board.
Theme: ${postPlan.theme}
Title hint: ${postPlan.title_hint}

${embedUrl ? `IMPORTANT: You MUST include this URL naturally in the post body: ${embedUrl}` : ''}

Rules:
- Write in Korean
- Match your persona's tone and style exactly
- Content must be substantive and on-topic (NOT generic filler)
- Use the signature phrases from your writing style occasionally
- Length should match your writing style (${persona.writing_style.length})
- Emoji usage: ${persona.writing_style.emoji}

You MUST respond with ONLY a JSON object, no markdown fences, no explanation:
{"title": "...", "content": "..."}`

  const result = await llmCall([{ role: 'user', content: prompt }], 1000)
  return {
    ...result,
    community_slug: postPlan.community,
    embed_url: embedUrl,
    embed_platform: postPlan.has_embed || null,
  }
}

async function generateComment(persona, targetPost, parentComment, isReply) {
  const contextText = parentComment
    ? `Replying to comment: "${parentComment.content_preview}"`
    : `Commenting on post: "${targetPost.title}" in ${targetPost.community_slug}`

  const prompt = `You are "${persona.nickname}", a Korean community user.
Role: ${persona.role_type}
Writing style: ${JSON.stringify(persona.writing_style)}
Opinion bias: ${JSON.stringify(persona.opinion_bias)}
Conflict tendency: ${persona.conflict_tendency}

${contextText}

${targetPost.content_preview ? `Post content: "${targetPost.content_preview}"` : ''}

Rules:
- Write in Korean
- Your comment MUST reference the topic/content being discussed (include at least 1 keyword from the context)
- Match your persona's tone exactly
- If conflict_tendency > 0.5 and the topic is debatable, you MAY disagree (use: claim -> reasoning -> question format)
- NO generic comments like "좋은 글이네요" unless you're a newbie persona
- Length: ${persona.writing_style.length}

You MUST respond with ONLY a JSON object, no markdown fences, no explanation:
{"content": "..."}`

  return await llmCall([{ role: 'user', content: prompt }], 500)
}

async function generatePhase(runId) {
  console.log('\n=== PHASE 2: GENERATE CONTENT ===')

  // Resume from existing file if present
  let allGeneratedPosts = []
  try {
    allGeneratedPosts = JSON.parse(readFileSync(new URL('./generated-posts.json', import.meta.url), 'utf-8'))
    console.log(`  Resuming: ${allGeneratedPosts.length} posts already generated`)
  } catch { /* fresh start */ }

  const completedKeys = new Set(allGeneratedPosts.map(p => `${p.persona_id}_${p.index}`))

  // Generate posts
  for (const personaPlan of contentPlan.post_allocation.plan) {
    const persona = personas.find(p => p.persona_id === personaPlan.persona_id)
    console.log(`\n  Generating posts for ${persona.nickname}...`)

    for (let i = 0; i < personaPlan.posts.length; i++) {
      const key = `${persona.persona_id}_${i}`
      if (completedKeys.has(key)) {
        console.log(`    [${i + 1}/10] skip (already generated)`)
        continue
      }

      const postPlan = personaPlan.posts[i]
      try {
        const generated = await generatePost(persona, postPlan, allGeneratedPosts)
        allGeneratedPosts.push({
          persona_id: persona.persona_id,
          user_id: `test_agent_${persona.persona_id}`,
          ...generated,
          index: i,
        })
        console.log(`    [${i + 1}/10] "${generated.title.substring(0, 40)}..."`)

        // Save after every post for crash recovery
        writeFileSync(
          new URL('./generated-posts.json', import.meta.url),
          JSON.stringify(allGeneratedPosts, null, 2)
        )

        await sleep(1500)
      } catch (err) {
        console.error(`    [${i + 1}/10] FAILED:`, err.message)
      }
    }
  }

  // Save intermediate results
  writeFileSync(
    new URL('./generated-posts.json', import.meta.url),
    JSON.stringify(allGeneratedPosts, null, 2)
  )

  console.log(`\n  Total posts generated: ${allGeneratedPosts.length}`)
  return { posts: allGeneratedPosts, comments: allGeneratedComments }
}

// ============================================================
// Phase 3: Execute — Insert into DB + test features
// ============================================================

async function executePhase(runId) {
  console.log('\n=== PHASE 3: EXECUTE ===')

  // Load generated content
  let generatedPosts
  try {
    generatedPosts = JSON.parse(readFileSync(new URL('./generated-posts.json', import.meta.url), 'utf-8'))
  } catch {
    console.error('  No generated-posts.json found. Run generate phase first.')
    return
  }

  // --- Insert Posts ---
  console.log('\n  Inserting posts...')
  const insertedPosts = []

  for (const post of generatedPosts) {
    const start = Date.now()
    try {
      // Build TipTap JSON content
      const tiptapContent = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: post.content }],
          },
        ],
      }

      // If there's an embed URL, add it as an embed node
      if (post.embed_url) {
        tiptapContent.content.push({
          type: 'embed',
          attrs: {
            url: post.embed_url,
            provider: post.embed_platform,
            title: '',
            thumbnail_url: '',
            author_name: '',
            html: '',
          },
        })
      }

      const { data, error } = await getSupabase().from('posts').insert({
        user_id: post.user_id,
        community_slug: post.community_slug,
        title: post.title,
        content: tiptapContent,
      }).select('id').single()

      const latency = Date.now() - start

      if (error) throw error

      insertedPosts.push({
        ...post,
        db_id: data.id,
      })

      // Log action
      await getSupabase().from('agent_actions').insert({
        run_id: runId,
        persona_id: post.persona_id,
        action_type: 'post',
        target_id: data.id,
        content_preview: post.title.substring(0, 100),
        success: true,
        latency_ms: latency,
        metadata: { community: post.community_slug, has_embed: !!post.embed_url },
      })

      // Flag as test data
      await getSupabase().from('content_flags').upsert({
        target_type: 'post',
        target_id: data.id,
        is_test_data: true,
        generator: 'agent_test',
        run_id: runId,
      }, { onConflict: 'target_type,target_id' })

      console.log(`    Post: ${post.title.substring(0, 50)}... (${latency}ms)`)
      await randomDelay(500, 2000)
    } catch (err) {
      const latency = Date.now() - start
      console.error(`    FAILED: ${post.title.substring(0, 50)}... - ${err.message}`)
      await getSupabase().from('agent_actions').insert({
        run_id: runId,
        persona_id: post.persona_id,
        action_type: 'post',
        content_preview: post.title.substring(0, 100),
        success: false,
        error: err.message,
        latency_ms: latency,
      })
    }
  }

  writeFileSync(
    new URL('./inserted-posts.json', import.meta.url),
    JSON.stringify(insertedPosts, null, 2)
  )

  // --- Generate & Insert Comments ---
  console.log('\n  Generating and inserting comments...')
  const insertedComments = []
  const commentStrategy = contentPlan.comment_allocation.strategy

  for (const persona of personas) {
    const strategy = commentStrategy[persona.persona_id]
    const userId = `test_agent_${persona.persona_id}`
    console.log(`\n  Comments for ${persona.nickname} (${strategy.replies_to_comments} threaded)...`)

    // Pick target posts (across communities)
    const targetPosts = insertedPosts
      .filter(p => p.persona_id !== persona.persona_id) // prioritize others' posts
      .sort(() => Math.random() - 0.5)

    const ownPosts = insertedPosts.filter(p => p.persona_id === persona.persona_id)
    const commentTargets = [
      ...targetPosts.slice(0, strategy.others_posts),
      ...ownPosts.slice(0, strategy.own_posts),
    ].slice(0, 30) // ensure we have enough targets

    let threadedCount = 0
    const distinctPostIds = new Set()

    for (let i = 0; i < 30; i++) {
      const targetPost = commentTargets[i % commentTargets.length]
      if (!targetPost?.db_id) continue

      distinctPostIds.add(targetPost.db_id)

      // Decide if this should be a threaded reply
      const shouldBeReply = threadedCount < strategy.replies_to_comments
        && insertedComments.filter(c => c.post_id === targetPost.db_id).length > 0

      let parentComment = null
      if (shouldBeReply) {
        const postComments = insertedComments.filter(c => c.post_id === targetPost.db_id)
        parentComment = pickRandom(postComments)
      }

      const start = Date.now()
      try {
        const generated = await generateComment(
          persona,
          targetPost,
          parentComment,
          !!parentComment
        )

        // Check for embed URL inclusion (ensure quota)
        let commentContent = generated.content
        const personaEmbedCount = insertedComments
          .filter(c => c.persona_id === persona.persona_id && c.embed_url).length
        const postEmbedCount = insertedPosts
          .filter(p => p.persona_id === persona.persona_id && p.embed_url).length

        // Ensure each persona has at least 1 of each embed type
        const usedPlatforms = new Set([
          ...insertedPosts.filter(p => p.persona_id === persona.persona_id && p.embed_platform).map(p => p.embed_platform),
          ...insertedComments.filter(c => c.persona_id === persona.persona_id && c.embed_platform).map(c => c.embed_platform),
        ])

        let embedUrl = null
        let embedPlatform = null
        const missingPlatforms = ['youtube', 'x', 'instagram'].filter(p => !usedPlatforms.has(p))
        if (missingPlatforms.length > 0 && i >= 25) {
          // In last few comments, fill missing embed quotas
          embedPlatform = missingPlatforms[0]
          embedUrl = pickRandom(EMBED_URLS[embedPlatform])
          commentContent += `\n\n${embedUrl}`
        }

        const { data, error } = await getSupabase().from('comments').insert({
          post_id: targetPost.db_id,
          user_id: userId,
          parent_id: parentComment?.db_id || null,
          content: commentContent,
        }).select('id').single()

        const latency = Date.now() - start

        if (error) throw error

        if (parentComment) threadedCount++

        const commentRecord = {
          db_id: data.id,
          post_id: targetPost.db_id,
          persona_id: persona.persona_id,
          parent_id: parentComment?.db_id || null,
          content_preview: commentContent.substring(0, 100),
          embed_url: embedUrl,
          embed_platform: embedPlatform,
        }
        insertedComments.push(commentRecord)

        // Log action
        await getSupabase().from('agent_actions').insert({
          run_id: runId,
          persona_id: persona.persona_id,
          action_type: parentComment ? 'reply' : 'comment',
          target_id: data.id,
          parent_id: parentComment?.db_id || null,
          content_preview: commentContent.substring(0, 100),
          success: true,
          latency_ms: latency,
          metadata: { post_id: targetPost.db_id, is_reply: !!parentComment },
        })

        // Flag as test data
        await getSupabase().from('content_flags').upsert({
          target_type: 'comment',
          target_id: data.id,
          is_test_data: true,
          generator: 'agent_test',
          run_id: runId,
        }, { onConflict: 'target_type,target_id' })

        const label = parentComment ? 'Reply' : 'Comment'
        console.log(`    [${i + 1}/30] ${label}: ${commentContent.substring(0, 50)}... (${latency}ms)`)

        // Respect 10s cooldown between comments from same user
        await sleep(11000)
      } catch (err) {
        const latency = Date.now() - start
        console.error(`    [${i + 1}/30] FAILED: ${err.message}`)
        await getSupabase().from('agent_actions').insert({
          run_id: runId,
          persona_id: persona.persona_id,
          action_type: parentComment ? 'reply' : 'comment',
          success: false,
          error: err.message,
          latency_ms: latency,
        })
        // If cooldown error, wait and retry
        if (err.message?.includes('COOLDOWN') || err.message?.includes('429')) {
          await sleep(15000)
          i-- // retry this iteration
        }
      }
    }

    console.log(`    Distinct posts commented: ${distinctPostIds.size}, Threaded: ${threadedCount}`)
  }

  // --- Upvote phase ---
  console.log('\n  Executing reactions...')
  for (const persona of personas) {
    const userId = `test_agent_${persona.persona_id}`
    const prob = contentPlan.behavior_rules.reactions.upvote_probability_by_role[persona.role_type] || 0.3
    const targets = insertedPosts
      .filter(p => p.persona_id !== persona.persona_id)
      .filter(() => Math.random() < prob)
      .slice(0, 15)

    for (const post of targets) {
      try {
        await getSupabase().from('post_votes').insert({
          post_id: post.db_id,
          user_id: userId,
          vote_type: 'up',
        })
        await getSupabase().from('agent_actions').insert({
          run_id: runId,
          persona_id: persona.persona_id,
          action_type: 'upvote',
          target_id: post.db_id,
          success: true,
          latency_ms: 0,
        })
      } catch {
        // Duplicate vote or other error — skip
      }
    }
    console.log(`    ${persona.nickname}: ${targets.length} upvotes`)
  }

  // --- oEmbed test phase ---
  console.log('\n  Testing oEmbed...')
  const allEmbedUrls = [
    ...insertedPosts.filter(p => p.embed_url).map(p => ({ url: p.embed_url, platform: p.embed_platform, source: 'post', id: p.db_id })),
    ...insertedComments.filter(c => c.embed_url).map(c => ({ url: c.embed_url, platform: c.embed_platform, source: 'comment', id: c.db_id })),
  ]

  for (const embed of allEmbedUrls) {
    const start = Date.now()
    try {
      const res = await fetch(`${APP_URL}/api/oembed?url=${encodeURIComponent(embed.url)}`)
      const latency = Date.now() - start
      const data = await res.json()
      const success = res.ok && data.provider

      await getSupabase().from('feature_test_logs').insert({
        run_id: runId,
        action_type: 'oembed_fetch',
        target_id: embed.id,
        target_url: embed.url,
        success,
        error: success ? null : (data.error || `HTTP ${res.status}`),
        latency_ms: latency,
        response_data: success ? { provider: data.provider, title: data.title } : null,
      })

      console.log(`    ${success ? 'OK' : 'FAIL'} [${embed.platform}] ${embed.url.substring(0, 60)}... (${latency}ms)`)
    } catch (err) {
      const latency = Date.now() - start
      await getSupabase().from('feature_test_logs').insert({
        run_id: runId,
        action_type: 'oembed_fetch',
        target_url: embed.url,
        success: false,
        error: err.message,
        latency_ms: latency,
      })
      console.error(`    FAIL [${embed.platform}] ${err.message}`)
    }
  }

  console.log(`\n  Execution complete: ${insertedPosts.length} posts, ${insertedComments.length} comments`)
}

// ============================================================
// Phase 4: Validate — Check quotas
// ============================================================

async function validatePhase(runId) {
  console.log('\n=== PHASE 4: VALIDATE ===')

  const { data: actions } = await supabase
    .from('agent_actions')
    .select('persona_id, action_type, success, metadata')
    .eq('run_id', runId)
    .eq('success', true)

  const report = { personas: {}, totals: {}, issues: [] }

  // Per-persona counts
  for (const p of personas) {
    const personaActions = actions.filter(a => a.persona_id === p.persona_id)
    const posts = personaActions.filter(a => a.action_type === 'post')
    const comments = personaActions.filter(a => a.action_type === 'comment')
    const replies = personaActions.filter(a => a.action_type === 'reply')
    const upvotes = personaActions.filter(a => a.action_type === 'upvote')

    const stats = {
      posts: posts.length,
      comments: comments.length + replies.length,
      replies: replies.length,
      upvotes: upvotes.length,
      distinct_posts_commented: new Set([
        ...comments.map(a => a.metadata?.post_id),
        ...replies.map(a => a.metadata?.post_id),
      ].filter(Boolean)).size,
    }

    report.personas[p.persona_id] = stats

    // Quota checks
    if (stats.posts < 10) report.issues.push(`${p.persona_id}: only ${stats.posts}/10 posts`)
    if (stats.comments < 30) report.issues.push(`${p.persona_id}: only ${stats.comments}/30 comments`)
    if (stats.replies < 10) report.issues.push(`${p.persona_id}: only ${stats.replies}/10 threaded replies`)
    if (stats.distinct_posts_commented < 12) report.issues.push(`${p.persona_id}: commented on only ${stats.distinct_posts_commented}/12 distinct posts`)
  }

  // Totals
  report.totals = {
    posts: actions.filter(a => a.action_type === 'post').length,
    comments: actions.filter(a => a.action_type === 'comment' || a.action_type === 'reply').length,
    replies: actions.filter(a => a.action_type === 'reply').length,
    upvotes: actions.filter(a => a.action_type === 'upvote').length,
  }

  // Embed quota check
  const { data: embedLogs } = await supabase
    .from('feature_test_logs')
    .select('target_url, success, response_data')
    .eq('run_id', runId)
    .eq('action_type', 'oembed_fetch')

  const embedCounts = { youtube: 0, x: 0, instagram: 0 }
  for (const log of (embedLogs || [])) {
    const url = log.target_url || ''
    if (url.includes('youtube.com') || url.includes('youtu.be')) embedCounts.youtube++
    else if (url.includes('x.com') || url.includes('twitter.com')) embedCounts.x++
    else if (url.includes('instagram.com')) embedCounts.instagram++
  }
  report.totals.embeds = embedCounts

  if (embedCounts.youtube < 20) report.issues.push(`Only ${embedCounts.youtube}/20 YouTube embeds`)
  if (embedCounts.x < 20) report.issues.push(`Only ${embedCounts.x}/20 X embeds`)
  if (embedCounts.instagram < 20) report.issues.push(`Only ${embedCounts.instagram}/20 Instagram embeds`)

  // Print report
  console.log('\n--- Validation Results ---')
  console.log(`Total Posts: ${report.totals.posts}/100`)
  console.log(`Total Comments: ${report.totals.comments}/300`)
  console.log(`Total Replies: ${report.totals.replies}`)
  console.log(`Total Upvotes: ${report.totals.upvotes}`)
  console.log(`Embeds - YouTube: ${embedCounts.youtube}, X: ${embedCounts.x}, Instagram: ${embedCounts.instagram}`)

  if (report.issues.length > 0) {
    console.log(`\nIssues (${report.issues.length}):`)
    report.issues.forEach(i => console.log(`  - ${i}`))
  } else {
    console.log('\nAll quotas met!')
  }

  return report
}

// ============================================================
// Phase 5: Report — Final JSON summary
// ============================================================

async function reportPhase(runId) {
  console.log('\n=== PHASE 5: FINAL REPORT ===')

  const validation = await validatePhase(runId)

  // oEmbed test results
  const { data: featureLogs } = await supabase
    .from('feature_test_logs')
    .select('*')
    .eq('run_id', runId)

  const oembedResults = {
    total: featureLogs?.length || 0,
    success: featureLogs?.filter(l => l.success).length || 0,
    failed: featureLogs?.filter(l => !l.success).length || 0,
    avg_latency_ms: Math.round(
      (featureLogs || []).reduce((sum, l) => sum + (l.latency_ms || 0), 0) / (featureLogs?.length || 1)
    ),
    by_platform: {
      youtube: {
        total: featureLogs?.filter(l => l.target_url?.includes('youtube') || l.target_url?.includes('youtu.be')).length || 0,
        success: featureLogs?.filter(l => l.success && (l.target_url?.includes('youtube') || l.target_url?.includes('youtu.be'))).length || 0,
      },
      x: {
        total: featureLogs?.filter(l => l.target_url?.includes('x.com') || l.target_url?.includes('twitter.com')).length || 0,
        success: featureLogs?.filter(l => l.success && (l.target_url?.includes('x.com') || l.target_url?.includes('twitter.com'))).length || 0,
      },
      instagram: {
        total: featureLogs?.filter(l => l.target_url?.includes('instagram.com')).length || 0,
        success: featureLogs?.filter(l => l.success && l.target_url?.includes('instagram.com')).length || 0,
      },
    },
  }

  // Action summary
  const { data: allActions } = await supabase
    .from('agent_actions')
    .select('action_type, success, latency_ms')
    .eq('run_id', runId)

  const actionSummary = {}
  for (const type of ['post', 'comment', 'reply', 'upvote']) {
    const typeActions = (allActions || []).filter(a => a.action_type === type)
    actionSummary[type] = {
      total: typeActions.length,
      success: typeActions.filter(a => a.success).length,
      failed: typeActions.filter(a => !a.success).length,
      avg_latency_ms: Math.round(
        typeActions.reduce((sum, a) => sum + (a.latency_ms || 0), 0) / (typeActions.length || 1)
      ),
    }
  }

  const finalReport = {
    run_id: runId,
    completed_at: new Date().toISOString(),
    quotas: validation,
    oembed_results: oembedResults,
    action_summary: actionSummary,
    pass: validation.issues.length === 0,
  }

  // Save report
  writeFileSync(
    new URL(`./report-${runId}.json`, import.meta.url),
    JSON.stringify(finalReport, null, 2)
  )

  // Update run record
  await getSupabase().from('agent_runs').update({
    status: validation.issues.length === 0 ? 'completed' : 'completed',
    completed_at: new Date().toISOString(),
    summary: finalReport,
  }).eq('run_id', runId)

  console.log(`\nReport saved: report-${runId}.json`)
  console.log(`Overall: ${finalReport.pass ? 'PASS' : 'ISSUES FOUND'}`)

  return finalReport
}

// ============================================================
// Cleanup — Remove all test data
// ============================================================

async function cleanupPhase() {
  console.log('\n=== CLEANUP ===')

  // Find all test content
  const { data: flags } = await supabase
    .from('content_flags')
    .select('target_type, target_id')
    .eq('is_test_data', true)

  if (!flags || flags.length === 0) {
    console.log('  No test data found.')
    return
  }

  const postIds = flags.filter(f => f.target_type === 'post').map(f => f.target_id)
  const commentIds = flags.filter(f => f.target_type === 'comment').map(f => f.target_id)
  const profileIds = flags.filter(f => f.target_type === 'profile').map(f => f.target_id)

  // Delete in order (respect FK constraints)
  if (commentIds.length > 0) {
    // Delete comment votes first
    await getSupabase().from('comment_votes').delete().in('comment_id', commentIds)
    await getSupabase().from('comments').delete().in('id', commentIds)
    console.log(`  Deleted ${commentIds.length} test comments`)
  }

  if (postIds.length > 0) {
    // Delete remaining comments on these posts, then post votes, then posts
    await getSupabase().from('comments').delete().in('post_id', postIds)
    await getSupabase().from('post_votes').delete().in('post_id', postIds)
    await getSupabase().from('posts').delete().in('id', postIds)
    console.log(`  Deleted ${postIds.length} test posts`)
  }

  if (profileIds.length > 0) {
    await getSupabase().from('profiles').delete().in('user_id', profileIds)
    console.log(`  Deleted ${profileIds.length} test profiles`)
  }

  // Clean agent tables
  await getSupabase().from('content_flags').delete().eq('is_test_data', true)
  await getSupabase().from('feature_test_logs').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  await getSupabase().from('agent_actions').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  await getSupabase().from('agent_runs').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  await getSupabase().from('agent_personas').delete().neq('id', '00000000-0000-0000-0000-000000000000')

  console.log('  Cleanup complete.')
}

// ============================================================
// Main
// ============================================================

async function main() {
  const args = process.argv.slice(2)
  const phaseIdx = args.indexOf('--phase')
  const phase = phaseIdx >= 0 ? args[phaseIdx + 1] : 'all'
  const runId = `run_${Date.now()}`

  console.log(`Agent Test Runner — Phase: ${phase}, Run ID: ${runId}`)

  try {
    switch (phase) {
      case 'setup':
        await setupPhase(runId)
        break
      case 'generate':
        await generatePhase(runId)
        break
      case 'execute':
        await executePhase(runId)
        break
      case 'validate':
        await validatePhase(runId)
        break
      case 'report':
        await reportPhase(runId)
        break
      case 'cleanup':
        await cleanupPhase()
        break
      case 'all':
        await setupPhase(runId)
        await generatePhase(runId)
        await executePhase(runId)
        await reportPhase(runId)
        break
      default:
        console.error(`Unknown phase: ${phase}`)
        process.exit(1)
    }
  } catch (err) {
    console.error('\nFATAL ERROR:', err)
    await getSupabase().from('agent_runs').update({
      status: 'failed',
      completed_at: new Date().toISOString(),
      summary: { error: err.message },
    }).eq('run_id', runId)
    process.exit(1)
  }

  process.exit(0)
}

main()
