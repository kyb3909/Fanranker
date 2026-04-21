"use client"

/**
 * MetaverseStage — 메타버스 최상위 React 래퍼.
 *
 * Phase 1: Phaser 씬 마운트 포인트 + 로딩 UI 플레이스홀더.
 * Phase 2+: Phaser `WorldMapScene` 동적 import, Realtime 연결, HUD 오버레이.
 *
 * 원칙: 이 컴포넌트는 /metaverse 라우트 전용. 기존 사이트 페이지에서 import 금지.
 */
export function MetaverseStage() {
  return (
    <div className="flex min-h-[100svh] flex-col items-center justify-center bg-neutral-950 px-6 text-center text-white">
      <div className="mx-auto max-w-xl">
        <p className="text-[11px] font-semibold tracking-[0.2em] text-white/40 uppercase">
          Stadium Metaverse · Phase 1 · Scaffolding
        </p>
        <h1 className="mt-3 text-2xl font-bold sm:text-3xl">경기장 메타버스 개발 중</h1>
        <p className="mt-4 text-sm leading-relaxed text-white/70">
          영국 월드맵에서 돌아다니며 채팅하고, 팬 활동으로 우리 팀 경기장을 직접 짓는 메타버스형 팬
          커뮤니티입니다.
          <br />
          <span className="text-white/50">
            완성되면 GNB에 메뉴가 추가됩니다. 지금은 내부 테스트 단계입니다.
          </span>
        </p>
        <div className="mt-8 grid grid-cols-1 gap-2 text-left text-xs text-white/60 sm:grid-cols-2">
          <Checkpoint done label="PRD 확정 (PRD-stadium-metaverse.md)" />
          <Checkpoint done label="격리 스캐폴딩 (app/metaverse, lib/metaverse, ...)" />
          <Checkpoint label="DB 마이그레이션 (metaverse_* 테이블)" />
          <Checkpoint label="UK 월드맵 에셋 (PixelLab)" />
          <Checkpoint label="아바타 스프라이트 (8방향 × 3종)" />
          <Checkpoint label="WorldMapScene (Phaser + Realtime Presence)" />
          <Checkpoint label="Proximity 말풍선 채팅" />
        </div>
      </div>
    </div>
  )
}

function Checkpoint({ done, label }: { done?: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.03] px-3 py-2">
      <span
        className={`inline-block h-3 w-3 flex-shrink-0 rounded-full ${
          done ? "bg-emerald-500" : "border border-white/25 bg-transparent"
        }`}
        aria-hidden
      />
      <span className={done ? "text-white/85" : ""}>{label}</span>
    </div>
  )
}
