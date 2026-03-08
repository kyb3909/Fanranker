import OpenAI from 'openai'

let client = null

function getClient() {
  if (!client) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('Missing OPENAI_API_KEY')
    }
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  }
  return client
}

/** Category-specific prompt hints to improve summarization quality */
function getCategoryHints(promptCategory) {
  const sports = {
    categories: 'transfer, rumor, result, injury, official, record, other',
    newsExamples: 'News includes: transfers, match results, injuries, official announcements, records, standings changes',
    terminology: 'Use Korean sports terminology naturally (이적, 부상, 골, 승리, 패배, 선발, 계약 etc.)',
  }
  const gaming = {
    categories: 'release, update, esports, review, deal, controversy, other',
    newsExamples: 'News includes: game releases, major updates/patches, esports results, industry deals, studio announcements, notable reviews',
    terminology: 'Use Korean gaming terminology (출시, 업데이트, 패치, 할인, e스포츠, 대회, DLC etc.)',
  }
  const entertainment = {
    categories: 'release, review, casting, award, box_office, controversy, other',
    newsExamples: 'News includes: new releases, casting news, award nominations/wins, box office results, production updates, notable reviews',
    terminology: 'Use Korean entertainment terminology (개봉, 캐스팅, 흥행, 수상, 시청률, 촬영 etc.)',
  }
  const music = {
    categories: 'comeback, chart, concert, award, collaboration, controversy, other',
    newsExamples: 'News includes: comebacks/releases, chart achievements, concert/tour announcements, awards, collaborations, music show wins',
    terminology: 'Use Korean music terminology (컴백, 음원, 차트, 콘서트, 투어, 음방, 수상 etc.)',
  }
  const idol = {
    categories: 'comeback, concert, variety, sns, controversy, fan_event, other',
    newsExamples: 'News includes: comebacks, concerts, fan meetings, variety show appearances, social media moments, award shows, dating/personal news',
    terminology: 'Use Korean idol terminology (컴백, 팬미팅, 직캠, 음방, 예능, 팬사인회, 화보 etc.)',
  }
  const anime = {
    categories: 'release, adaptation, review, industry, event, other',
    newsExamples: 'News includes: new anime/manga announcements, adaptation news, season confirmations, industry news, event announcements, notable chapter releases',
    terminology: 'Use Korean anime/manga terminology (방영, 연재, 애니화, 극장판, 시즌, 성우 etc.)',
  }
  const general = {
    categories: 'news, culture, trend, opinion, event, other',
    newsExamples: 'News includes: trending topics, cultural events, social issues, viral stories, notable discussions',
    terminology: 'Use natural conversational Korean appropriate for community boards',
  }

  const cat = promptCategory.toLowerCase()
  if (['해외축구', 'epl', '라리가', 'epl판타지', '야구', 'kbo', '일본야구', '농구', 'nba분석', '배구',
       '프리미어리그', '국내축구', 'mlb', '한국농구', 'nba',
       '레알마드리드', '바르셀로나', '맨체스터유나이티드', '리버풀', '맨시티', '첼시', '아스널', '토트넘',
       '바이에른뮌헨', 'psg', '유벤투스'].includes(cat))
    return sports
  if (['게임', '게임뉴스', 'pc게임', '닌텐도', '플레이스테이션', '리그오브레전드', '발로란트',
       '스팀', '엑스박스'].includes(cat))
    return gaming
  if (['영화', '호러영화', 'sf영화', '해외드라마', '한국드라마',
       '박스오피스', '마블', 'dc', '넷플릭스', 'hbo', '스타워즈', '디즈니플러스'].includes(cat))
    return entertainment
  if (['k-pop', '힙합', '팝음악', '음악'].includes(cat))
    return music
  if (['아이돌', '아이돌팬덤'].includes(cat))
    return idol
  if (['애니메이션', '만화', '웹툰/만화'].includes(cat))
    return anime
  return general
}

/**
 * Send posts to GPT-5.1 for news filtering + Korean summarization.
 *
 * @param {object[]} posts - Posts from fetcher (reddit or naver-news)
 * @param {object} source - Source config from sources.json
 * @returns {Promise<object[]>} Filtered & summarized items with their original post data
 */
export async function summarizePosts(posts, source) {
  if (source.type === 'naver-news') {
    return summarizeNaverPosts(posts, source)
  }
  return summarizeRedditPosts(posts, source)
}

/** Summarize Naver news articles (already in Korean, need headline + 3-line summary) */
async function summarizeNaverPosts(posts, source) {
  if (posts.length === 0) return []

  const categoryHints = getCategoryHints(source.prompt_category)

  const postsText = posts
    .map(
      (p, i) =>
        `[${i + 1}] 제목: ${p.original_title}\n    요약: ${p.description_kr || '(없음)'}\n    출처: ${p.author}`
    )
    .join('\n\n')

  const systemPrompt = `You are a senior ${source.prompt_category} news editor at FanRanker, Korea's largest fan community.
Your readers are passionate fans who want REAL news fast — not filler or rehashed press releases.

═══ 최우선 원칙 (ABSOLUTE RULES) ═══

1. 한국 대중성 기준: "한국의 20~40대 일반 대중이 관심을 가질만한 뉴스"만 통과시켜라.
   - 해당 분야 매니아만 아는 소식은 REJECT. 일반인도 "오 그래?" 하고 관심 가질 수준이어야 함.
   - 판단 기준: 네이버 실시간 검색어에 오를 수 있는 수준인가?
   - 해외 뉴스는 한국에서도 화제가 될 만한 것만 (예: 손흥민, BTS, 오타니 등 한국인 관련 or 글로벌 대형 이슈)
   - 마이너 리그, 무명 선수, 비주류 장르의 소식은 아무리 해당 분야에서 중요해도 REJECT.

2. 정치 완전 배제: 정치적으로 민감하거나 논쟁이 될 수 있는 사안은 절대 게시하지 않는다.
   - 정치인 관련 뉴스 → REJECT
   - 정치적 논란이 포함된 스포츠/연예 뉴스 → REJECT (예: 선수의 정치 발언, 정치인과 연예인 관계)
   - 국가 간 정치 갈등이 배경인 스포츠 이슈 → REJECT
   - 사회적으로 진영이 나뉘는 논쟁 → REJECT
   - 군 관련, 병역 논란 → REJECT

3. 주제 중복 방지: 같은 사건/주제에 대한 기사가 여러 개면 가장 정보가 풍부한 1개만 is_news=true로.
   - 같은 경기 결과를 다른 각도로 쓴 기사들 → 1개만
   - 같은 이적 루머의 후속 기사 → 새로운 팩트가 있을 때만
   - 비슷한 주제의 기사가 3개 이상이면 반드시 1개로 압축

═══ 판단 기준 ═══

For each article, determine:
1. is_news: true ONLY for stories that Korean general public would actually care about. Be EXTREMELY STRICT.
2. category: one of [${categoryHints.categories}]
3. importance: 1-5 scale:
   - 5: 속보급 (긴급 이적, 큰 부상, 대형 사건, 기록 경신, 충격적 결과)
   - 4: 화제성 높음 (확정 발표, 공식 계약, 수상, 논란)
   - 3: 주요 뉴스 (일반 경기 결과, 선수 근황, 업데이트)
   - 2: 관심 뉴스 (루머, 전망, 분석)
   - 1: 마이너 (사소한 소식)
4. headline_kr: 15-25자, 커뮤니티 게시판 제목 스타일 (언론체 금지, 팬이 쓴 것처럼)
5. summary_lines: 정확히 3문장, 핵심 팩트 위주, 각 문장은 마침표로 끝남

MUST REJECT (is_news=false):
- 보도자료, 협찬, 광고성 기사
- 루틴 기사 (경기 일정, 주간 리뷰, 라운드업)
- 클릭베이트 (제목만 자극적이고 내용 없음)
- 이미 다뤄진 동일 사안의 반복 기사
- 포토/화보/영상 모음
- 팬 반응만 정리한 기사 ("네티즌 반응", "팬들 열광")
- 사설/칼럼 (새로운 팩트 없이 의견만)
- 한국 대중이 모르는 마이너한 인물/팀/작품
- 정치적 사안이 조금이라도 포함된 기사
- 한국과 무관한 해외 로컬 뉴스

MUST ACCEPT (is_news=true):
- 속보: 이적, 부상, 계약, 해고, 주요 경기 결과 (단, 한국 대중이 아는 수준)
- 기록: 신기록, 마일스톤 달성 (글로벌 or 한국 선수)
- 논란: 여론이 형성된 사건/사고 (비정치적인 것만)
- 공식 발표: 신작, 컴백, 출시, 시즌 확정
- 서프라이즈: 예상 밖 전개로 토론 유발

${categoryHints.newsExamples}
- 같은 사건 기사가 여러 개면 가장 정보가 많은 1개만 is_news=true
- ${categoryHints.terminology}
- 출처가 주요 언론사(조선/중앙/KBS/SBS/연합 등)이면 신뢰도 가산

Return JSON: { "items": [{ "index": 1, "is_news": true/false, "category": "...", "importance": 3, "headline_kr": "...", "summary_lines": ["...", "...", "..."] }] }
Include ALL articles in the response (non-newsworthy = is_news=false).`

  const openai = getClient()
  const response = await openai.chat.completions.create({
    model: 'gpt-5.1',
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: `다음 ${source.prompt_category} 뉴스 기사를 분석해주세요:\n\n${postsText}`,
      },
    ],
    temperature: 0.3,
    max_completion_tokens: 3000,
  })

  const content = response.choices[0].message.content
  let result
  try {
    result = JSON.parse(content)
  } catch {
    throw new Error(`GPT returned invalid JSON: ${content.slice(0, 200)}`)
  }

  if (!result.items || !Array.isArray(result.items)) {
    throw new Error('GPT response missing "items" array')
  }

  return result.items
    .filter(item => item.is_news && item.index >= 1 && item.index <= posts.length)
    .map(item => ({
      category: item.category || 'other',
      importance: Math.min(5, Math.max(1, item.importance || 3)),
      headline_kr: item.headline_kr,
      summary_lines: item.summary_lines || [],
      post: posts[item.index - 1],
    }))
}

/** Summarize Reddit posts (English → Korean translation + summary) */
async function summarizeRedditPosts(posts, source) {
  if (posts.length === 0) return []

  const postsText = posts
    .map(
      (p, i) =>
        `[${i + 1}] ${p.original_title} (score: ${p.score}, comments: ${p.num_comments}${p.flair ? `, flair: ${p.flair}` : ''})`
    )
    .join('\n')

  const categoryHints = getCategoryHints(source.prompt_category)

  const systemPrompt = `You are a ${source.prompt_category} news editor for a Korean community (FanRanker).
Analyze Reddit posts and create Korean news summaries.

═══ 최우선 원칙 (ABSOLUTE RULES) ═══

1. 한국 대중성 기준: "한국의 20~40대 일반 대중이 관심을 가질만한 뉴스"만 통과시켜라.
   - 해당 서브레딧 매니아만 아는 소식은 REJECT. 일반 한국인도 관심 가질 수준이어야 함.
   - 해외 뉴스는 한국에서도 화제가 될 만한 것만 (한국인 선수/아티스트 관련 or 글로벌 대형 이슈)
   - Reddit에서 인기 있어도 한국 대중에게 무관하면 REJECT.

2. 정치 완전 배제: 정치적으로 민감하거나 논쟁이 될 수 있는 사안은 절대 게시하지 않는다.
   - 정치인 관련, 정치적 논란이 포함된 뉴스 → REJECT
   - 국가 간 정치 갈등 배경의 이슈 → REJECT
   - 사회적 진영 논쟁 → REJECT

3. 주제 중복 방지: 같은 사건/주제의 포스트가 여러 개면 가장 정보가 풍부한 1개만 is_news=true.

═══ 판단 기준 ═══

For each post, determine:
1. is_news: true ONLY for stories Korean general public would care about. Be EXTREMELY STRICT.
2. category: one of [${categoryHints.categories}]
3. importance: 1-5 (5 = major breaking news, 3 = standard news, 1 = minor update)
4. headline_kr: Korean headline, 15-25 characters, concise and impactful
5. summary_lines: array of exactly 3 Korean sentences summarizing the news

Rules:
- Only mark is_news=true for actual newsworthy items that Korean general public would recognize
- ${categoryHints.newsExamples}
- Skip low-effort memes, daily megathreads, simple questions, personal rants
- Skip posts about minor/unknown players, teams, or creators that Korean public wouldn't know
- Skip any politically sensitive content
- Headlines should be punchy and informative Korean style
- Each summary line should be a complete sentence ending with a period
- ${categoryHints.terminology}
- If multiple posts cover the same topic, only the most informative one gets is_news=true

Return JSON: { "items": [{ "index": 1, "is_news": true/false, "category": "...", "importance": 3, "headline_kr": "...", "summary_lines": ["...", "...", "..."] }] }
Include ALL posts in the response (even non-news ones with is_news=false).`

  const openai = getClient()
  const response = await openai.chat.completions.create({
    model: 'gpt-5.1',
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: `Analyze these ${source.prompt_category} posts from r/${source.subreddit}:\n\n${postsText}`,
      },
    ],
    temperature: 0.3,
    max_completion_tokens: 3000,
  })

  const content = response.choices[0].message.content
  let result
  try {
    result = JSON.parse(content)
  } catch {
    throw new Error(`GPT returned invalid JSON: ${content.slice(0, 200)}`)
  }

  if (!result.items || !Array.isArray(result.items)) {
    throw new Error('GPT response missing "items" array')
  }

  return result.items
    .filter(item => item.is_news && item.index >= 1 && item.index <= posts.length)
    .map(item => ({
      category: item.category || 'other',
      importance: Math.min(5, Math.max(1, item.importance || 3)),
      headline_kr: item.headline_kr,
      summary_lines: item.summary_lines || [],
      post: posts[item.index - 1],
    }))
}
