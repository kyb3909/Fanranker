/**
 * 불변식 카탈로그 — 감사관(invariant-audit)이 잡는 위반 하나하나를 **사람 말**로 (순수 모듈, 2026-09-02).
 *
 * 왜 있나: 디스코드 알림이 `notation_alt_in_title` 같은 영문 코드를 제목으로, 본문을 180자에서
 * 잘라 보내고 있었다 — 잘린 자리가 하필 "…을 의심할 것" 조치 부분이라, 받는 사람은 뭐가
 * 문제인지도 뭘 하면 되는지도 알 수 없었다 (운영자 2026-09-02 "뭐가 문제인지 좀 더 구체적으로").
 *
 * 항목마다 세 질문에 답한다: 무엇이 깨졌나(label) · 사용자에게 무슨 일이 생기나(impact) ·
 * 지금 뭘 하면 되나(action). 그리고 그 위반을 다루는 관제실 화면(adminPath).
 *
 * ⚠️ 감사관에 불변식을 추가하면 여기도 추가한다 — `__tests__/lib/ops/invariant-catalog.test.ts` 가
 *    라우트의 `invariant: "…"` 리터럴을 전수로 읽어 빠진 항목을 잡는다.
 */

export interface InvariantInfo {
  /** 사람이 읽는 이름 */
  label: string
  /** 그대로 두면 사용자·운영에 무슨 일이 생기나 */
  impact: string
  /** 첫 조치 — 한 문장 */
  action: string
  /** 이 위반을 다루는 관제실 화면 (상대경로) */
  adminPath: string
}

export const INVARIANT_CATALOG: Record<string, InvariantInfo> = {
  saga_title_korean: {
    label: "사가 제목이 한글이 아님",
    impact: "사가 목록·앵커 글에 영문 제목이 그대로 노출된다",
    action: "선수 표기를 사전에 등재한 뒤 사가 제목을 갱신한다",
    adminPath: "/admin/saga-review",
  },
  cron_heartbeat: {
    label: "크론이 제때 돌지 않음",
    impact: "그 작업이 맡은 것(발행·정산·라인업 등)이 조용히 멈춰 있다",
    action: "Vercel 크론 로그와 최근 배포를 확인하고, 급하면 라우트를 수동 호출한다",
    adminPath: "/admin/system",
  },
  dup_published_pair: {
    label: "같은 소식이 두 번 발행된 의심",
    impact: "독자에게 같은 기사가 두 개 보인다",
    action: "뉴스 검수에서 둘을 비교해 하나를 내린다 (정상 후속 기사면 무시)",
    adminPath: "/admin/news-review",
  },
  notation_alt_in_title: {
    label: "발행 제목이 옛/오 표기를 씀",
    impact: "같은 선수 이름이 기사마다 다르게 보인다",
    action: "제목을 대표 표기로 고친다 — 고치면 자동 학습이 다음부터 잡는다",
    adminPath: "/admin/news-review",
  },
  dict_alias_poisoned: {
    label: "표기 사전 오염 의심",
    impact: "다른 사람의 이름이 엉뚱한 선수 표기로 바뀔 수 있다",
    action: "사전에서 그 오표기 항목을 확인하고 잘못 붙은 것이면 지운다",
    adminPath: "/admin/team-dictionary",
  },
  discord_webhook_missing: {
    label: "디스코드 웹훅 미설정",
    impact: "모든 운영 경보가 무음이다 — 이 알림을 보고 있다면 이미 해결된 것",
    action: "Vercel 환경변수 DISCORD_OPS_WEBHOOK_URL 을 넣는다",
    adminPath: "/admin/system",
  },
  saga_stage_regressed: {
    label: "사가 단계가 뒤로 감",
    impact: "이미 오피셜까지 간 이적이 다시 루머로 보인다",
    action: "사가 검수에서 단계를 최대치로 되돌리고 원인 기사를 본다",
    adminPath: "/admin/saga-review",
  },
  saga_identity_mismatch: {
    label: "사가 신원이 사전과 어긋남",
    impact: "화면 이름과 내부 키가 다른 사람을 가리켜 기사가 엉뚱한 사가에 붙는다",
    action: "사가 검수에서 대상 선수를 사전 항목과 맞춘다",
    adminPath: "/admin/saga-review",
  },
  lineup_bench_empty: {
    label: "끝난 경기 라인업에 벤치가 없음",
    impact: "교체 표기와 MoTM 교체 후보가 통째로 빠진다",
    action: "라인업 소스의 응답 필드명이 바뀌었는지 보고, 저장분은 복구 스크립트로 채운다",
    adminPath: "/admin/matches",
  },
  match_report_dup: {
    label: "한 경기에 리포트가 둘 이상",
    impact: "LLM 비용이 중복으로 나가고 지면에 리포트가 겹친다",
    action: "중복 리포트를 지우고, 조회가 경기 단위로 돌아왔는지 본다",
    adminPath: "/admin/matches",
  },
  motm_poll_missing: {
    label: "끝난 경기에 MoTM 폴이 없음",
    impact: "경기 직후 가장 참여가 몰리는 시간에 투표할 것이 없다",
    action: "MoTM 생성 크론(15분)과 FT 증거 경로(LFA 상세)를 본다",
    adminPath: "/admin/matches",
  },
  timeline_name_latin: {
    label: "타임라인에 한글화되지 않은 이름",
    impact: "득점·카드 표기에 영문 이름이 섞여 나온다",
    action: "정규화 호출이 빠진 자리를 찾고, 저장분은 backfill-timeline-names 로 고친다",
    adminPath: "/admin/matches",
  },
  lfa_link_team_mismatch: {
    label: "경기에 남의 LFA 매치가 붙음",
    impact: "매치센터·라인업·MoTM 이 다른 경기 데이터를 보여준다",
    action: "match_details_cache 에서 그 경기 행을 지운다 — 다음 조회가 팀명 가드로 다시 붙인다",
    adminPath: "/admin/matches",
  },
  lfa_link_missing: {
    label: "대상 리그 경기에 LFA 링크가 없음",
    impact: "라인업·스탯·불판·리포트가 그 경기들에서 통째로 빠진다",
    action: "사전에 빠진 팀(팀명 가드가 끊음)·LFA 표기 변경·lfa-warm 결번 순으로 본다",
    adminPath: "/admin/matches",
  },
}

/** 카탈로그에 없는 코드가 와도 알림은 나간다 — 코드 그대로 보이되 조치는 관제실로 */
export function describeInvariant(id: string): InvariantInfo {
  return (
    INVARIANT_CATALOG[id] ?? {
      label: id,
      impact: "(카탈로그에 없는 불변식 — lib/ops/invariant-catalog.ts 에 추가할 것)",
      action: "관제실에서 상세를 본다",
      adminPath: "/admin/operations",
    }
  )
}

/**
 * 디스코드 임베드 필드 한 칸 — 이름은 사람 말 + 코드, 값은 근거(summary) → 조치 → 링크.
 * summary 는 700자까지 (종전 180자 — 조치가 잘려 나가던 길이).
 */
export function formatFindingField(
  finding: { invariant: string; summary: string },
  siteUrl: string
): { name: string; value: string } {
  const info = describeInvariant(finding.invariant)
  const summary =
    finding.summary.length > 700 ? `${finding.summary.slice(0, 697)}…` : finding.summary
  return {
    name: `${info.label} (${finding.invariant})`,
    value: `${summary}\n💥 ${info.impact}\n🔧 ${info.action} · [관제실](${siteUrl}${info.adminPath})`,
  }
}
