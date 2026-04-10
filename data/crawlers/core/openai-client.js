// data/crawlers/core/openai-client.js
//
// Shared OpenAI client. Exists here (not in data/agents/) so that
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

export default openai
