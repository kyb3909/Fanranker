// Central reservoir item. All agents read/update parts of this.
// Mirror this with a Supabase table `news_reservoir`.

export type ReservoirStatus =
  | "ingested"
  | "credibility_passed"
  | "credibility_rejected"
  | "normalized"
  | "enriched"
  | "dedupe_checked"
  | "duplicate"
  | "desk_approved"
  | "desk_rejected"
  | "desk_held"
  | "desk_merge"
  | "assigned"
  | "drafted"
  | "formatted"
  | "published"
  | "failed"

export type IssueType =
  | "transfer"
  | "injury"
  | "contract"
  | "official"
  | "match"
  | "interview"
  | "discipline"
  | "club_ops"
  | "other"

export interface SocialUrl {
  type: "x" | "instagram" | "youtube" | "article" | "other"
  url: string
  author?: string
  videoId?: string
  oembedSupported?: boolean
}

export interface ResolvedEntity {
  id: string | null // alias dictionary id, null if unresolved
  surface: string // original (English/native) form
  preferred_ko: string | null // preferred Korean display name
  confidence: number // 0..1
  source: "dictionary" | "generic" | "tentative"
}

export interface UnresolvedEntity {
  category: "player" | "team" | "coach" | "competition"
  surface: string
  reason: string
  tentative_ko: string | null
}

export interface ReservoirScores {
  credibility: number // 0..1
  newsworthiness: number // 0..1
  namingConfidence?: number // 0..1
  dedupeSimilarity?: number // 0..1, max neighbor similarity
}

export type DeskAction = "approve" | "reject" | "hold" | "merge" | "request_rewrite" | "reassign"

export interface DeskDecision {
  decision: DeskAction
  reason: string
  flags: {
    unverified: boolean
    needsManualNaming: boolean
    sensitive: boolean
  }
  mergeTargetId?: string
  rewriteHint?: string
  decidedAt: string
}

export interface KoreanBrief {
  headline: string // <= 25 chars
  body: string // 300..600 chars
  citations: { media: string; snippet: string }[]
  unverifiedFlags: string[]
  draftHash: string // sha1(headline + body)
}

export interface PublishMeta {
  title: string
  slug: string
  metaDescription: string
  keywords: string[]
  ogImageHint: string
}

export interface AuditEntry {
  at: string
  agent: string
  action: string
  status_from?: ReservoirStatus
  status_to?: ReservoirStatus
  model?: string
  tier?: "T0" | "T1" | "T2" | "T3"
  pool?: string
  tokensIn?: number
  tokensOut?: number
  latencyMs?: number
  costEstimateUsd?: number
  verdict?: string
  message?: string
}

export interface ReservoirItem {
  id: string // e.g. reddit_<sub>_<postid>
  source: {
    platform: "reddit" | "naver" | "manual"
    subreddit?: string
    postId?: string
    author?: string
    createdUtc?: number
    flair?: string
    score?: number
    upvoteRatio?: number
    domain?: string
  }
  urls: {
    reddit?: string
    article?: string
    socials: SocialUrl[]
    embeddable?: SocialUrl[]
  }
  raw: {
    title: string
    excerpt: string // <= 400 chars, html-stripped
    lang: string
  }
  normalized?: {
    title: string
    excerpt: string
    candidateEntities: {
      teams: string[]
      players: string[]
      coaches: string[]
      competitions: string[]
    }
    officialAnnouncement: boolean
  }
  entities?: {
    teams: ResolvedEntity[]
    players: ResolvedEntity[]
    coaches: ResolvedEntity[]
    competitions: ResolvedEntity[]
  }
  unresolvedEntities?: UnresolvedEntity[]
  tags?: string[]
  issueType?: IssueType
  scores: ReservoirScores
  dedupeKey: string
  status: ReservoirStatus
  decision?: DeskDecision
  assignment?: { writer: string; priority: "high" | "normal" | "low"; deadlineMinutes: number }
  draft?: KoreanBrief
  publish?: PublishMeta
  externalKey?: string
  audit: AuditEntry[]
  createdAt: string
  updatedAt: string
}
