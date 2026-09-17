import { notFound } from "next/navigation"
import { EmptyScene } from "@/components/empty-scene"

const examples = [
  {
    scene: "search",
    label: "검색 결과",
    title: "검색 결과가 없습니다.",
    description: "다른 검색어나 검색 타입을 시도해보세요.",
    size: 192,
  },
  {
    scene: "rest",
    label: "경기 일정",
    title: "이 날짜에는 대상 리그 경기가 없습니다.",
    description: "날짜를 바꿔 다른 경기를 확인해보세요.",
    size: 208,
  },
  {
    scene: "lineup",
    label: "라인업 대기",
    title: "라인업은 킥오프 약 1시간 전에 공개됩니다",
    description: "킥오프 전 다시 확인해보세요.",
    size: 192,
  },
  {
    scene: "chat",
    label: "빈 담벼락",
    title: "관심 게시판을 팔로우해보세요!",
    description: "팔로우한 게시판의 글이 내 담벼락에 표시돼요.",
    size: 160,
  },
  {
    scene: "chat",
    label: "첫 댓글",
    title: "아직 댓글이 없습니다.",
    description: "첫 이야기를 남겨보세요.",
    size: 96,
  },
  {
    scene: "rest",
    label: "순위표 대기",
    title: "순위표를 준비 중입니다.",
    description: "데이터가 없는 경우에만 표시합니다.",
    size: 208,
  },
] as const

export default function EmptyScenesPreview() {
  if (process.env.NODE_ENV !== "development") notFound()
  return (
    <main className="worldcup-scope mx-auto max-w-5xl space-y-6 px-4 py-8">
      <header>
        <p className="text-[13px]" style={{ color: "var(--wc-mute)" }}>
          디자인 검수 · 빈 상태
        </p>
        <h1 className="mt-2 text-[26px] font-bold">공놀이의 다음 장면</h1>
        <p className="mt-2 text-[14px]" style={{ color: "var(--wc-mute)" }}>
          빈 상태는 작은 선 아이콘으로 안내하고, 치비는 유휴 애니메이션에서만 등장합니다.
        </p>
      </header>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {examples.map((example) => (
          <section
            key={example.label}
            className="rounded-xl border p-5 text-center"
            style={{
              borderColor: "var(--wc-line)",
              background: "var(--wc-card)",
            }}
          >
            <h2
              className="mb-3 text-left text-[13px] font-bold"
              style={{ color: "var(--wc-mute)" }}
            >
              {example.label}
            </h2>
            <EmptyScene scene={example.scene} size={example.size} />
            <p className="mt-3 text-[13px] font-semibold">{example.title}</p>
            <p className="mt-1 text-[12px]" style={{ color: "var(--wc-mute)" }}>
              {example.description}
            </p>
          </section>
        ))}
      </div>
    </main>
  )
}
