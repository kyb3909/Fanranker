"use client"

import Link from "@/components/ui/app-link"
import { trackEvent } from "@/lib/analytics/events"

/**
 * 기사 상세 종단 내비 (2026-08-21 데드엔드 리포트 Top5-3) — 봇 기사 전용.
 *
 * 구글→기사 직착륙 방문자의 이탈 지점이 "기사 끝 = 푸터"였다. 같은 말머리(팀) 관련
 * 기사 3건 + "다음 떡밥" 1행으로 뉴스→뉴스 사슬을 만든다 — 봇 기사 하루 26건은
 * 콜드스타트에서 유일하게 마르지 않는 순환로다. 사람 활동 장치("지금 담벼락에서")보다
 * 항상 **아래** 배치 — 2026-08-20 "사람 활동 우선" 결정과 충돌하지 않는다.
 *
 * 후보 순서는 같은 말머리 우선 (리버풀 기사 다음이 토트넘이면 그건 "다음"이 아니라
 * 남의 뉴스다 — 테스터 판정). 댓글 0 글의 카운트는 그리지 않는다 (0 카운트 숨김).
 */

export interface ArticleNavPost {
  id: string
  title: string
  comments: number
}

export function ArticleNextNav({
  related,
  next,
}: {
  related: ArticleNavPost[]
  next: ArticleNavPost | null
}) {
  if (related.length === 0 && !next) return null
  return (
    <div className="space-y-2">
      {related.length > 0 && (
        <div
          className="rounded-xl pb-1.5"
          style={{
            background: "var(--wc-card)",
            border: "1px solid var(--wc-line)",
            boxShadow: "var(--wc-shadow-1)",
          }}
        >
          <p
            className="px-4 pt-3 pb-1 text-[12px] font-extrabold"
            style={{ color: "var(--wc-mute)", letterSpacing: "0.04em" }}
          >
            관련 떡밥
          </p>
          {related.map((p) => (
            <Link
              key={p.id}
              href={`/post/${p.id}?utm_source=article_related`}
              className="block px-4 py-2 no-underline transition-colors hover:bg-[var(--wc-soft)]"
              onClick={() =>
                trackEvent({
                  name: "cardnews_card_open_post",
                  params: { post_id: p.id, destination: "post", via: "article_related" },
                })
              }
            >
              <span
                className="text-[13px] leading-snug font-bold"
                style={{ color: "var(--wc-ink)", wordBreak: "keep-all" }}
              >
                {p.title}
                {p.comments > 0 && (
                  <span
                    className="gn-num ml-1.5 text-[12px] font-bold"
                    style={{ color: "var(--wc-burgundy)" }}
                  >
                    [{p.comments}]
                  </span>
                )}
              </span>
            </Link>
          ))}
        </div>
      )}
      {next && (
        <Link
          href={`/post/${next.id}?utm_source=article_next`}
          className="flex items-baseline justify-between gap-3 rounded-xl px-4 py-3 no-underline transition-colors hover:bg-[var(--wc-tint)]"
          style={{ background: "var(--wc-wine-tint)", border: "1px solid var(--wc-line)" }}
          onClick={() =>
            trackEvent({
              name: "cardnews_card_open_post",
              params: { post_id: next.id, destination: "post", via: "article_next" },
            })
          }
        >
          <span className="min-w-0 flex-1 truncate text-[13px] font-bold">
            <span style={{ color: "var(--wc-mute)" }}>다음 떡밥 · </span>
            <span style={{ color: "var(--wc-ink)" }}>{next.title}</span>
          </span>
          <span className="shrink-0 text-[12px] font-bold" style={{ color: "var(--wc-burgundy)" }}>
            계속 읽기 →
          </span>
        </Link>
      )}
    </div>
  )
}
