import { Button } from "@/components/ui/button"
import { Check, Loader2, Sparkles } from "lucide-react"
import type { Category } from "./sign-up-shared"

interface CommunitiesStepProps {
  sportsCommunities: Category[]
  lifeCommunities: Category[]
  selectedSlugs: Set<string>
  toggleCommunity: (slug: string) => void
  submitting: boolean
  onSubmit: () => void
  onBack: () => void
}

export function CommunitiesStep({
  sportsCommunities,
  lifeCommunities,
  selectedSlugs,
  toggleCommunity,
  submitting,
  onSubmit,
  onBack,
}: CommunitiesStepProps) {
  const canProceed = selectedSlugs.size >= 1

  return (
    <div className="p-6">
      <h2 className="text-foreground mb-1 text-lg font-bold">관심 게시판 선택</h2>
      <p className="text-muted-foreground mb-5 text-sm">
        관심 게시판을 고르면 내 담벼락이 채워져요. 1개 이상 선택해주세요.
      </p>

      {/* Sports */}
      {sportsCommunities.length > 0 && (
        <div className="mb-4">
          <p className="text-muted-foreground mb-2 text-xs font-semibold tracking-wider uppercase">
            스포츠
          </p>
          <div className="flex flex-wrap gap-2">
            {sportsCommunities.map((cat) => {
              const isSelected = selectedSlugs.has(cat.slug)
              return (
                <button
                  key={cat.slug}
                  type="button"
                  onClick={() => toggleCommunity(cat.slug)}
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-2 text-sm font-medium transition-all ${
                    isSelected
                      ? "bg-primary/10 border-primary text-primary"
                      : "border-border text-foreground hover:border-primary/50 hover:bg-muted/40"
                  }`}
                >
                  <span>{cat.icon || "📋"}</span>
                  <span>{cat.name}</span>
                  {isSelected && <Check className="h-3.5 w-3.5" />}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Life */}
      {lifeCommunities.length > 0 && (
        <div className="mb-4">
          <p className="text-muted-foreground mb-2 text-xs font-semibold tracking-wider uppercase">
            라이프
          </p>
          <div className="flex flex-wrap gap-2">
            {lifeCommunities.map((cat) => {
              const isSelected = selectedSlugs.has(cat.slug)
              return (
                <button
                  key={cat.slug}
                  type="button"
                  onClick={() => toggleCommunity(cat.slug)}
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-2 text-sm font-medium transition-all ${
                    isSelected
                      ? "bg-primary/10 border-primary text-primary"
                      : "border-border text-foreground hover:border-primary/50 hover:bg-muted/40"
                  }`}
                >
                  <span>{cat.icon || "📋"}</span>
                  <span>{cat.name}</span>
                  {isSelected && <Check className="h-3.5 w-3.5" />}
                </button>
              )
            })}
          </div>
        </div>
      )}

      <p className="text-muted-foreground mb-4 text-xs">{selectedSlugs.size}개 선택됨</p>

      <div className="mt-2 flex justify-between">
        <Button variant="ghost" onClick={onBack}>
          이전
        </Button>
        <Button onClick={onSubmit} disabled={!canProceed || submitting} className="gap-1.5">
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              저장 중...
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" />
              시작하기
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
