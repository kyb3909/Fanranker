// data/crawlers/core/openai-client.js
//
// Shared OpenAI client + retry wrapper. Exists here (not in data/agents/) so that
// Node's module resolution from data/agents/scripts/* can walk through
// this file's parent directory and find data/crawlers/node_modules/openai.
// Same pattern as core/db.js.

import OpenAI from 'openai'

const apiKey = process.env.OPENAI_API_KEY

if (!apiKey) {
  console.error('Missing OPENAI_API_KEY')
  process.exit(1)
}

const openai = new OpenAI({ apiKey })

/**
 * openai.chat.completions.create() with exponential backoff retry.
 * Retries on 429 (rate limit) and 5xx (server errors). All other errors throw immediately.
 *
 * @param {object} params - Same params as openai.chat.completions.create()
 * @param {number} [maxRetries=2] - Maximum retry attempts (0 = no retries)
 * @returns {Promise<object>} OpenAI response
 */
export async function chatWithRetry(params, maxRetries = 2) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await openai.chat.completions.create(params)
    } catch (e) {
      if (attempt === maxRetries) throw e

      const status = e.status || e.statusCode
      if (status === 429 || (status >= 500 && status < 600)) {
        const waitMs = Math.min(1000 * Math.pow(2, attempt) + Math.random() * 500, 30000)
        await new Promise((r) => setTimeout(r, waitMs))
      } else {
        throw e // 4xx client error — don't retry
      }
    }
  }
}

export default openai
