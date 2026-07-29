import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Check, ChevronRight, ChevronDown } from "lucide-react"
import { TermsContent } from "@/components/legal/terms-content"
import { PrivacyContent } from "@/components/legal/privacy-content"

interface TermsStepProps {
  termsAgreed: boolean
  setTermsAgreed: (v: boolean) => void
  privacyAgreed: boolean
  setPrivacyAgreed: (v: boolean) => void
  onNext: () => void
}

export function TermsStep({
  termsAgreed,
  setTermsAgreed,
  privacyAgreed,
  setPrivacyAgreed,
  onNext,
}: TermsStepProps) {
  const [termsOpen, setTermsOpen] = useState(true)
  const [privacyOpen, setPrivacyOpen] = useState(true)
  // 만 14세 확인 — 약관 제4조의 가입 연령 제한을 화면에서 실제로 집행한다.
  // 생년월일 수집은 하지 않는다(최소수집 원칙) — 체크 방식이 국내 커뮤니티 통상 관행.
  const [ageConfirmed, setAgeConfirmed] = useState(false)

  const canProceed = termsAgreed && privacyAgreed && ageConfirmed

  return (
    <div className="p-6">
      <h2 className="text-foreground mb-1 text-lg font-bold">약관 동의</h2>
      <p className="text-muted-foreground mb-5 text-sm">
        공놀이를 시작하려면 약관 동의가 필요해요.
      </p>

      <div className="space-y-3">
        {/* 이용약관 */}
        <div className="border-border overflow-hidden rounded-lg border">
          <div className="flex items-center gap-3 p-4">
            <button
              type="button"
              role="checkbox"
              aria-checked={termsAgreed}
              onClick={() => setTermsAgreed(!termsAgreed)}
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
                termsAgreed ? "bg-primary border-primary text-white" : "border-input bg-background"
              }`}
            >
              {termsAgreed && <Check className="h-3.5 w-3.5" />}
            </button>
            <button
              type="button"
              onClick={() => setTermsOpen(!termsOpen)}
              className="flex flex-1 items-center justify-between"
            >
              <span>
                <span className="text-foreground text-sm font-medium">이용약관에 동의합니다</span>
                <span className="text-muted-foreground ml-1 text-xs">(필수)</span>
              </span>
              <ChevronDown
                className={`text-muted-foreground h-4 w-4 shrink-0 transition-transform ${termsOpen ? "rotate-180" : ""}`}
              />
            </button>
          </div>
          {termsOpen && (
            <div className="border-border max-h-48 overflow-y-auto border-t px-4 py-3">
              <TermsContent />
            </div>
          )}
        </div>

        {/* 개인정보처리방침 */}
        <div className="border-border overflow-hidden rounded-lg border">
          <div className="flex items-center gap-3 p-4">
            <button
              type="button"
              role="checkbox"
              aria-checked={privacyAgreed}
              onClick={() => setPrivacyAgreed(!privacyAgreed)}
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
                privacyAgreed
                  ? "bg-primary border-primary text-white"
                  : "border-input bg-background"
              }`}
            >
              {privacyAgreed && <Check className="h-3.5 w-3.5" />}
            </button>
            <button
              type="button"
              onClick={() => setPrivacyOpen(!privacyOpen)}
              className="flex flex-1 items-center justify-between"
            >
              <span>
                <span className="text-foreground text-sm font-medium">
                  개인정보처리방침에 동의합니다
                </span>
                <span className="text-muted-foreground ml-1 text-xs">(필수)</span>
              </span>
              <ChevronDown
                className={`text-muted-foreground h-4 w-4 shrink-0 transition-transform ${privacyOpen ? "rotate-180" : ""}`}
              />
            </button>
          </div>
          {privacyOpen && (
            <div className="border-border max-h-48 overflow-y-auto border-t px-4 py-3">
              <PrivacyContent />
            </div>
          )}
        </div>

        {/* 만 14세 이상 확인 */}
        <div className="border-border overflow-hidden rounded-lg border">
          <div className="flex items-center gap-3 p-4">
            <button
              type="button"
              role="checkbox"
              aria-checked={ageConfirmed}
              onClick={() => setAgeConfirmed(!ageConfirmed)}
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
                ageConfirmed ? "bg-primary border-primary text-white" : "border-input bg-background"
              }`}
            >
              {ageConfirmed && <Check className="h-3.5 w-3.5" />}
            </button>
            <span>
              <span className="text-foreground text-sm font-medium">만 14세 이상입니다</span>
              <span className="text-muted-foreground ml-1 text-xs">(필수)</span>
            </span>
          </div>
        </div>
      </div>

      <div className="mt-6 flex justify-end">
        <Button onClick={onNext} disabled={!canProceed} className="gap-1">
          다음
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
