import { createAggWriter } from "./agg-writing.mjs"
import { loadAggCorrections } from "./agg-corrections.mjs"
// data/agents/core/agg-gen.js
//
// 애그리게이터 페르소나 글 생성 코어 (학습 하니스 + 라이브 발행이 공유).
// 레버: ① 각도(angle) ② 페르소나 캐릭터 시트 ③ 구조 룰렛 ④ 교정 few-shot.
// 학습(agg-train)과 라이브(agg-write-run)가 이 모듈을 함께 써서, 학습 결과가 곧 발행 품질이 된다.

import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const AGENTS_DIR = join(__dirname, "..")

export const CONFIG = JSON.parse(
  readFileSync(join(AGENTS_DIR, "config", "aggregator.json"), "utf8")
)
export const TIERS = JSON.parse(
  readFileSync(join(AGENTS_DIR, "config", "model-tiers.json"), "utf8")
)
const PROMPT_PATH = join(AGENTS_DIR, "prompts", "agg-rewriter.md")
const CORRECTIONS_PATH = join(AGENTS_DIR, "config", "agg-corrections.json")

export const WRITE_MODEL = TIERS.tiers.T1.default.id
export const SITE_ORIGIN = "https://gongnori.fan"

/** 교정 학습 저장소 로드 */
export function loadCorrections() {
  if (!existsSync(CORRECTIONS_PATH)) return { version: 1, pairs: [] }
  try {
    return JSON.parse(readFileSync(CORRECTIONS_PATH, "utf8"))
  } catch {
    return { version: 1, pairs: [] }
  }
}

export function saveCorrections(store) {
  writeFileSync(CORRECTIONS_PATH, JSON.stringify(store, null, 2))
}

/** 교정/반려를 DB(agg_training_entries)에서 실시간 로드 — 검수 페이지의 교정·반려가
 *  learn/커밋/배포 없이 다음 생성부터 바로 반영된다. DB의 최신 교정을 우선하며,
 *  옛 CLI가 파일로 회수한 이력도 제외하지 않는다. DB 실패 시 파일만 사용한다. */
export async function loadCorrectionsLive(supabase) {
  const base = loadCorrections()
  if (!Array.isArray(base.rejects)) base.rejects = []
  try {
    return await loadAggCorrections(supabase, base)
  } catch {
    // DB 조회 실패 — 파일 저장소만으로 진행
  }
  return base
}

const writer = createAggWriter(CONFIG, WRITE_MODEL, readFileSync(PROMPT_PATH, "utf8"))
export const { pickPersona, pickStructure, buildMessages, generatePost } = writer
export function buildSystemPrompt(corrections = loadCorrections()) {
  return writer.buildSystemPrompt(corrections)
}

export function ensureDir(path) {
  if (!existsSync(path)) mkdirSync(path, { recursive: true })
}
