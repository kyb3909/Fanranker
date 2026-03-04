import { BackButton } from "@/components/back-button"
import { Card } from "@/components/ui/card"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "게시물 운영정책",
  alternates: { canonical: "/content-policy" },
}

export default function ContentPolicyPage() {
  return (
    <main id="main-content" className="mx-auto max-w-2xl px-4 py-5 sm:px-6 sm:py-6" tabIndex={-1}>
      <BackButton />
      <Card className="border-border bg-card mt-4 border p-6">
        <h1 className="text-foreground mb-6 text-2xl font-bold">게시물 운영정책</h1>
        <div className="text-foreground/90 space-y-6 text-[14px] leading-relaxed">

          <p>
            공놀이판(gongnori.fan)은 건전하고 활기찬 스포츠 커뮤니티를 지향합니다.
            모든 회원이 즐겁게 참여할 수 있는 환경을 만들기 위해 다음 운영정책을 시행합니다.
          </p>

          <section>
            <h2 className="text-foreground mb-2 text-lg font-semibold">1. 금지 행위</h2>
            <p className="mb-2">다음에 해당하는 게시물은 사전 통지 없이 삭제될 수 있으며, 반복 시 이용이 제한됩니다.</p>

            <div className="space-y-3">
              <div>
                <h3 className="text-foreground mb-1 font-medium">1-1. 혐오·차별·비방</h3>
                <ul className="list-disc space-y-0.5 pl-5">
                  <li>특정 개인, 팀, 선수에 대한 심한 비방, 모욕, 인신공격</li>
                  <li>성별, 인종, 국적, 종교, 장애 등을 이유로 한 혐오·차별 표현</li>
                  <li>다른 회원에 대한 지속적 괴롭힘, 스토킹 행위</li>
                </ul>
              </div>

              <div>
                <h3 className="text-foreground mb-1 font-medium">1-2. 불법·유해 콘텐츠</h3>
                <ul className="list-disc space-y-0.5 pl-5">
                  <li>음란물, 과도한 폭력적 콘텐츠</li>
                  <li>불법 도박, 사기, 마약 등 범죄 관련 내용</li>
                  <li>타인의 개인정보(실명, 연락처, 주소 등) 무단 노출</li>
                  <li>허위 사실 유포 및 명예훼손</li>
                </ul>
              </div>

              <div>
                <h3 className="text-foreground mb-1 font-medium">1-3. 스팸·홍보</h3>
                <ul className="list-disc space-y-0.5 pl-5">
                  <li>무분별한 광고, 홍보, 상업적 게시물</li>
                  <li>동일하거나 유사한 내용의 반복 게시 (도배)</li>
                  <li>외부 링크 유도를 위한 저품질 게시물</li>
                  <li>봇 또는 자동화 도구를 이용한 게시물 작성</li>
                </ul>
              </div>

              <div>
                <h3 className="text-foreground mb-1 font-medium">1-4. 저작권 침해</h3>
                <ul className="list-disc space-y-0.5 pl-5">
                  <li>타인의 저작물을 무단으로 복제·배포하는 행위</li>
                  <li>뉴스 기사 전문 복사 (요약 및 출처 표기는 허용)</li>
                  <li>경기 중계 영상을 무단 공유하는 행위</li>
                </ul>
              </div>

              <div>
                <h3 className="text-foreground mb-1 font-medium">1-5. 서비스 악용</h3>
                <ul className="list-disc space-y-0.5 pl-5">
                  <li>게시판 주제와 무관한 내용의 반복 게시</li>
                  <li>승부 예측 시스템을 악용하는 행위 (다중 계정 등)</li>
                  <li>다른 회원을 사칭하는 행위</li>
                  <li>운영진을 사칭하거나 허위 안내를 하는 행위</li>
                </ul>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-foreground mb-2 text-lg font-semibold">2. 게시물 작성 가이드</h2>
            <ul className="list-disc space-y-1 pl-5">
              <li>각 게시판의 주제에 맞는 게시물을 작성해 주세요.</li>
              <li>출처가 있는 정보는 반드시 출처를 표기해 주세요.</li>
              <li>스포일러가 포함된 내용은 제목에 [스포일러] 또는 [스포] 태그를 달아주세요.</li>
              <li>건설적인 토론과 비판은 환영하지만, 인신공격은 허용되지 않습니다.</li>
              <li>다양한 의견을 존중하고, 상대방에 대한 기본적인 예의를 지켜주세요.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-foreground mb-2 text-lg font-semibold">3. 제재 기준</h2>
            <p className="mb-2">위반 정도와 횟수에 따라 다음과 같이 조치합니다.</p>
            <div className="overflow-x-auto">
              <table className="border-border w-full border text-[13px]">
                <thead>
                  <tr className="bg-muted/30">
                    <th className="border-border border px-3 py-2 text-left">단계</th>
                    <th className="border-border border px-3 py-2 text-left">조치</th>
                    <th className="border-border border px-3 py-2 text-left">상세</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="border-border border px-3 py-2">1차</td>
                    <td className="border-border border px-3 py-2">경고</td>
                    <td className="border-border border px-3 py-2">해당 게시물 삭제 및 경고 알림</td>
                  </tr>
                  <tr>
                    <td className="border-border border px-3 py-2">2차</td>
                    <td className="border-border border px-3 py-2">게시 제한</td>
                    <td className="border-border border px-3 py-2">7일간 게시물 작성 제한</td>
                  </tr>
                  <tr>
                    <td className="border-border border px-3 py-2">3차</td>
                    <td className="border-border border px-3 py-2">이용 정지</td>
                    <td className="border-border border px-3 py-2">30일간 서비스 이용 정지</td>
                  </tr>
                  <tr>
                    <td className="border-border border px-3 py-2">4차 이상</td>
                    <td className="border-border border px-3 py-2">영구 정지</td>
                    <td className="border-border border px-3 py-2">계정 영구 이용 정지</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-muted-foreground mt-2 text-[13px]">
              심각한 위반(불법 콘텐츠, 범죄 행위 등)의 경우 경고 없이 즉시 영구 정지될 수 있습니다.
            </p>
          </section>

          <section>
            <h2 className="text-foreground mb-2 text-lg font-semibold">4. 신고 및 이의제기</h2>
            <ul className="list-disc space-y-1 pl-5">
              <li>부적절한 게시물을 발견하면 신고 기능을 이용해 주세요.</li>
              <li>운영진이 접수된 신고를 검토하여 운영정책에 따라 조치합니다.</li>
              <li>제재에 대한 이의가 있는 경우, 고객센터를 통해 이의제기할 수 있습니다.</li>
              <li>이의제기 접수 후 영업일 기준 7일 이내에 결과를 안내합니다.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-foreground mb-2 text-lg font-semibold">5. 승부 예측 이용 규칙</h2>
            <ul className="list-disc space-y-1 pl-5">
              <li>승부 예측은 오락 목적으로 제공되며, 실제 금전 거래가 아닙니다.</li>
              <li>볼(포인트)을 이용하여 예측에 참여하며, 적중 시 보상을 받습니다.</li>
              <li>다중 계정을 이용한 예측 조작은 엄격히 금지되며, 적발 시 모든 관련 계정이 정지됩니다.</li>
              <li>비정상적인 방법(버그 악용 등)으로 볼을 획득하는 행위는 금지됩니다.</li>
            </ul>
          </section>

          <section className="border-border border-t pt-4">
            <p className="text-muted-foreground text-[13px]">
              본 운영정책은 2026년 3월 3일부터 시행합니다.<br />
              운영정책은 서비스 환경 변화에 따라 수정될 수 있으며, 변경 시 공지합니다.
            </p>
          </section>
        </div>
      </Card>
    </main>
  )
}
