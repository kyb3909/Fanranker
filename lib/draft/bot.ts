// ============================
// 봇 식별 (client + server 공용)
// ============================
export const BOT_IDS = ['bot_alpha', 'bot_beta', 'bot_gamma'] as const

const BOT_PROFILES: Record<string, { name: string; avatar: string | null }> = {
  bot_alpha: { name: '봇 철수', avatar: null },
  bot_beta: { name: '봇 영희', avatar: null },
  bot_gamma: { name: '봇 민수', avatar: null },
}

export function isBotUser(userId: string): boolean {
  return userId.startsWith('bot_')
}

export function getBotProfile(botId: string) {
  return BOT_PROFILES[botId] || { name: botId, avatar: null }
}
