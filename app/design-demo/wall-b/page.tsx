import Link from "next/link"
import { getCachedCardNews } from "@/lib/home/cached-home-data"
import { Chip } from "@/components/saga/tier-chip"
import { RAIL_BODY_BORDER, RAIL_GRID, RailDate, groupByDay } from "@/components/saga/rail"

/**
 * 시안 — 담벼락을 "안 B"(헤어라인)로 그리면 어떻게 되나.
 *
 * 개발 환경 전용 (app/design-demo/layout.tsx 가 프로덕션에서 404).
 * **실제 담벼락은 건드리지 않았다** — 사이트 정문이라 눈으로 보고 판정받는 게 먼저다.
 *
 * ⚠️ 데이터는 홈이 쓰는 그 함수(getCachedCardNews)를 그대로 부른다. 목업 배열이 아니라
 *    지금 담벼락에 떠 있는 실제 카드다. 지난번 회색 네모 시안이 반려된 이유가 그거였다.
 *
 * 실제로 옮길 때 같이 봐야 할 것 (Explore 조사 결과):
 *   · components/cardnews/card-news-feed.tsx:613 CompactCard  ← 이 행
 *   · components/home/wall-post-card.tsx:30 WallPostCard      ← 위를 픽셀로 흉내 낸 쌍둥이
 *   · 같은 스트림에 끼어드는 위젯들(설문·디스코드·작성기·이적 프로모·댓글 미리보기·
 *     피드 끝)이 전부 카드라, 행만 선으로 바꾸면 그것들만 떠 보인다.
 */

export const dynamic = "force-dynamic"

function relTime(iso: string): string {
  const min = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  if (min < 60) return `${min}분 전`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr}시간 전`
  return `${Math.round(hr / 24)}일 전`
}

export default async function WallHairlineDemo() {
  const { cards } = await getCachedCardNews()
  const items = cards.slice(0, 18)

  return (
    <div className="worldcup-scope min-h-[100dvh]" style={{ background: "var(--wc-paper)" }}>
      <main className="mx-auto max-w-[720px] px-4 pt-8 pb-24 sm:px-6">
        <p
          className="text-[12px] font-extrabold"
          style={{ color: "var(--wc-burgundy)", letterSpacing: "0.16em" }}
        >
          DESIGN PILOT
        </p>
        <h1 className="text-[31px] font-extrabold" style={{ color: "var(--wc-ink)" }}>
          담벼락을 안 B로
        </h1>
        <p
          className="mt-3 text-[14px]"
          style={{ color: "var(--wc-mute)", lineHeight: 1.75, wordBreak: "keep-all" }}
        >
          지금 담벼락에 실제로 떠 있는 카드를 그대로 가져와 사가와 같은 문법으로 그렸습니다. 카드
          껍데기·그림자를 걷고, 날짜는 왼쪽 레일이 하루 한 번 맡습니다. 비교는{" "}
          <Link href="/" style={{ color: "var(--wc-burgundy)", fontWeight: 700 }}>
            지금 담벼락
          </Link>
          과 나란히 놓고 보세요.
        </p>

        <div className="mt-8 flex flex-col">
          {groupByDay(items, (c) => c.createdAt).map((day, di) => (
            <div key={day.key} className={RAIL_GRID} style={di > 0 ? { marginTop: 20 } : undefined}>
              <RailDate iso={day.iso} />

              <div>
                {day.items.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-start gap-3 py-3 pl-4 sm:pl-6"
                    style={RAIL_BODY_BORDER}
                  >
                    <div className="min-w-0 flex-1">
                      {/* 첫 줄 = [칩] 제목 — 사가 3면이 쓰는 그 배치 */}
                      <p
                        className="text-[16px] leading-[1.4] font-bold"
                        style={{ color: "var(--wc-ink)", wordBreak: "keep-all" }}
                      >
                        <span className="mr-1.5">
                          <Chip tone="soft">{c.flair?.name ?? "소식"}</Chip>
                        </span>
                        {c.title}
                      </p>

                      {/* 둘째 줄 = 메타. 지금은 이게 제목 '위'에 있다 */}
                      <p
                        className="mt-1.5 flex flex-wrap items-center gap-x-1.5 text-[12px]"
                        style={{ color: "var(--wc-mute)" }}
                      >
                        {c.source && (
                          <>
                            <span className="font-bold" style={{ color: "var(--wc-ink)" }}>
                              {c.source}
                            </span>
                            <span style={{ color: "var(--wc-line-2)" }}>·</span>
                          </>
                        )}
                        <span>{relTime(c.createdAt)}</span>
                        {c.commentCount > 0 && (
                          <>
                            <span style={{ color: "var(--wc-line-2)" }}>·</span>
                            <span>
                              댓글 <span className="gn-num">{c.commentCount}</span>
                            </span>
                          </>
                        )}
                        {c.voteCount > 0 && (
                          <>
                            <span style={{ color: "var(--wc-line-2)" }}>·</span>
                            <span
                              style={
                                c.voteCount >= 10
                                  ? { color: "var(--wc-ink)", fontWeight: 600 }
                                  : undefined
                              }
                            >
                              추천 <span className="gn-num">{c.voteCount}</span>
                            </span>
                          </>
                        )}
                      </p>
                    </div>

                    {/* 지금 담벼락 썸네일은 104×76 인데, 레일(62px)이 생기면서 모바일에서
                        제목 폭이 ~200px 로 눌려 3줄로 흘렀다. 88×64 로 줄였다.
                        없으면 슬롯 자체를 없앤다 (플레이스홀더 금지). */}
                    {c.image ? (
                      // eslint-disable-next-line @next/next/no-img-element -- 시안 전용
                      <img
                        src={c.image}
                        alt=""
                        width={88}
                        height={64}
                        className="shrink-0 rounded-lg"
                        style={{ width: 88, height: 64, objectFit: "cover" }}
                      />
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-12" style={{ borderTop: "1px solid var(--wc-line)" }} />
        <p
          className="mt-4 text-[13px]"
          style={{ color: "var(--wc-mute-2)", lineHeight: 1.75, wordBreak: "keep-all" }}
        >
          이대로 가면 담벼락에 섞여 있는 위젯들(설문·디스코드 배너·글쓰기·이적 상황판·댓글
          미리보기)도 같이 손봐야 합니다. 지금은 전부 흰 카드라, 목록만 선으로 바꾸면 그것들만 동동
          떠 보입니다.
        </p>
      </main>
    </div>
  )
}
