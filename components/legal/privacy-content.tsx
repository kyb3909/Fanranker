import {
  BUSINESS_INFO,
  isBusinessInfoConfigured,
  isContactEmailConfigured,
} from "@/lib/site-config"

export function PrivacyContent() {
  return (
    <div className="text-foreground/90 space-y-6 text-[13px] leading-relaxed">
      <p>
        블루버드홀딩스(이하 &quot;회사&quot;)는 개인정보보호법, 정보통신망법 등 관련 법령을
        준수하며, 공놀이판(gongnori.fan) 서비스 이용자의 개인정보를 보호하기 위해 다음과 같은
        처리방침을 수립합니다.
      </p>

      <section>
        <h3 className="text-foreground mb-2 font-semibold">1. 수집하는 개인정보 항목</h3>
        <p className="mb-2">회사는 서비스 제공을 위해 최소한의 개인정보를 수집합니다.</p>
        <div className="bg-muted/30 rounded-md p-3">
          <p className="mb-1 font-medium">회원가입 시 (필수)</p>
          <ul className="list-disc space-y-0.5 pl-5">
            <li>이메일 주소</li>
            <li>닉네임 (사용자 설정)</li>
            <li>프로필 이미지 (소셜 로그인 시 제공되는 경우)</li>
          </ul>
        </div>
        <div className="bg-muted/30 mt-2 rounded-md p-3">
          <p className="mb-1 font-medium">소셜 로그인 시 (자동 수집 — 구글, 카카오 등)</p>
          <ul className="list-disc space-y-0.5 pl-5">
            <li>소셜 계정 고유 식별자 (OAuth ID)</li>
            <li>소셜 계정에 등록된 이름 또는 닉네임</li>
            <li>소셜 계정에 등록된 이메일 주소</li>
          </ul>
          <p className="text-muted-foreground mt-1.5 text-[12px]">
            카카오 로그인 도입 시 카카오(주)로부터 카카오계정 이메일, 닉네임, 프로필 사진을
            제공받으며, 상세 항목은 로그인 화면의 동의 단계에서 고지됩니다.
          </p>
        </div>
        <div className="bg-muted/30 mt-2 rounded-md p-3">
          <p className="mb-1 font-medium">서비스 이용 중 자동 수집</p>
          <ul className="list-disc space-y-0.5 pl-5">
            <li>접속 IP, 브라우저 종류, 접속 일시</li>
            <li>서비스 이용 기록 (게시물, 댓글, 좋아요, 예측 참여 내역)</li>
            <li>쿠키 정보</li>
          </ul>
        </div>
        <div className="bg-muted/30 mt-2 rounded-md p-3">
          <p className="mb-1 font-medium">유료 결제 시</p>
          <ul className="list-disc space-y-0.5 pl-5">
            <li>결제 수단 정보 (결제 대행사를 통해 처리)</li>
            <li>결제 내역</li>
          </ul>
        </div>
      </section>

      <section>
        <h3 className="text-foreground mb-2 font-semibold">2. 개인정보의 수집 및 이용 목적</h3>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>회원 관리:</strong> 가입 의사 확인, 본인 식별, 부정 이용 방지, 고지·안내 사항
            전달
          </li>
          <li>
            <strong>서비스 제공:</strong> 게시판 이용, 승부 예측, 커뮤니티 기능, 콘텐츠 제공
          </li>
          <li>
            <strong>결제 처리:</strong> 유료 서비스 결제 및 환불 처리
          </li>
          <li>
            <strong>서비스 개선:</strong> 이용 통계 분석, 서비스 품질 개선, 맞춤형 콘텐츠 제공
          </li>
          <li>
            <strong>안전한 환경:</strong> 불법·부적절 활동 탐지 및 방지, 분쟁 조정
          </li>
        </ul>
      </section>

      <section>
        <h3 className="text-foreground mb-2 font-semibold">3. 개인정보의 보유 및 이용 기간</h3>
        <p className="mb-2">
          회사는 개인정보 수집 및 이용 목적이 달성된 후에는 해당 정보를 지체 없이 파기합니다. 단,
          관련 법령에 따라 보존이 필요한 경우 아래 기간 동안 보관합니다.
        </p>
        <div className="bg-muted/30 rounded-md p-3">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong>계약 또는 청약철회 등에 관한 기록:</strong> 5년 (전자상거래법)
            </li>
            <li>
              <strong>대금결제 및 재화 등의 공급에 관한 기록:</strong> 5년 (전자상거래법)
            </li>
            <li>
              <strong>소비자 불만 또는 분쟁 처리에 관한 기록:</strong> 3년 (전자상거래법)
            </li>
            <li>
              <strong>로그인 기록:</strong> 3개월 (통신비밀보호법)
            </li>
          </ul>
        </div>
      </section>

      <section>
        <h3 className="text-foreground mb-2 font-semibold">4. 개인정보의 제3자 제공</h3>
        <p>
          회사는 원칙적으로 회원의 개인정보를 제3자에게 제공하지 않습니다. 다만 다음의 경우는 예외로
          합니다.
        </p>
        <ul className="mt-1 list-disc space-y-0.5 pl-5">
          <li>회원이 사전에 동의한 경우</li>
          <li>법령에 의거하거나 수사기관의 요청이 있는 경우</li>
        </ul>
      </section>

      <section>
        <h3 className="text-foreground mb-2 font-semibold">5. 개인정보 처리 위탁</h3>
        <p className="mb-2">회사는 서비스 제공을 위해 다음과 같이 개인정보 처리를 위탁합니다.</p>
        <div className="overflow-x-auto">
          <table className="border-border w-full border text-[12px]">
            <thead>
              <tr className="bg-muted/30">
                <th className="border-border border px-3 py-2 text-left">수탁 업체</th>
                <th className="border-border border px-3 py-2 text-left">위탁 업무</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border-border border px-3 py-2">Clerk (미국)</td>
                <td className="border-border border px-3 py-2">회원 인증 및 계정 관리</td>
              </tr>
              <tr>
                <td className="border-border border px-3 py-2">Supabase (미국)</td>
                <td className="border-border border px-3 py-2">데이터베이스 호스팅 및 파일 저장</td>
              </tr>
              <tr>
                <td className="border-border border px-3 py-2">Vercel (미국)</td>
                <td className="border-border border px-3 py-2">웹 서비스 호스팅</td>
              </tr>
              <tr>
                <td className="border-border border px-3 py-2">Sentry (미국)</td>
                <td className="border-border border px-3 py-2">오류 모니터링 (비식별 정보)</td>
              </tr>
              <tr>
                <td className="border-border border px-3 py-2">포트원 주식회사 (대한민국)</td>
                <td className="border-border border px-3 py-2">결제 처리 대행</td>
              </tr>
              <tr>
                <td className="border-border border px-3 py-2">Google LLC / Vercel Inc. (미국)</td>
                <td className="border-border border px-3 py-2">
                  서비스 이용 통계 분석 (Google Analytics, Vercel Analytics)
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h3 className="text-foreground mb-2 font-semibold">5-2. 개인정보의 국외 이전</h3>
        <p className="mb-2">
          회사는 서비스 제공을 위해 아래와 같이 개인정보를 국외로 이전합니다. 이전은 서비스 이용
          시점에 정보통신망을 통해 이루어집니다.
        </p>
        <div className="overflow-x-auto">
          <table className="border-border w-full border text-[12px]">
            <thead>
              <tr className="bg-muted/30">
                <th className="border-border border px-3 py-2 text-left">이전받는 자 (연락처)</th>
                <th className="border-border border px-3 py-2 text-left">국가</th>
                <th className="border-border border px-3 py-2 text-left">이전 항목</th>
                <th className="border-border border px-3 py-2 text-left">보유·이용 기간</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border-border border px-3 py-2">Clerk, Inc. (privacy@clerk.com)</td>
                <td className="border-border border px-3 py-2">미국</td>
                <td className="border-border border px-3 py-2">이메일, OAuth 식별자, 닉네임</td>
                <td className="border-border border px-3 py-2">회원 탈퇴 시까지</td>
              </tr>
              <tr>
                <td className="border-border border px-3 py-2">
                  Supabase, Inc. (privacy@supabase.io)
                </td>
                <td className="border-border border px-3 py-2">미국</td>
                <td className="border-border border px-3 py-2">서비스 이용 기록, 게시물</td>
                <td className="border-border border px-3 py-2">회원 탈퇴 시까지</td>
              </tr>
              <tr>
                <td className="border-border border px-3 py-2">
                  Vercel, Inc. (privacy@vercel.com)
                </td>
                <td className="border-border border px-3 py-2">미국</td>
                <td className="border-border border px-3 py-2">접속 IP, 접속 로그</td>
                <td className="border-border border px-3 py-2">3개월</td>
              </tr>
              <tr>
                <td className="border-border border px-3 py-2">
                  Functional Software, Inc. (Sentry)
                </td>
                <td className="border-border border px-3 py-2">미국</td>
                <td className="border-border border px-3 py-2">오류 발생 시 비식별 진단 정보</td>
                <td className="border-border border px-3 py-2">90일</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-2">
          이용자는 위 국외 이전을 거부할 수 있으며, 거부 시 회원가입 및 서비스 이용이 제한됩니다.
          거부는 제10항의 개인정보 보호책임자에게 요청할 수 있습니다.
        </p>
      </section>

      <section>
        <h3 className="text-foreground mb-2 font-semibold">6. 개인정보의 파기 절차 및 방법</h3>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>파기 절차:</strong> 보유 기간이 만료되거나 처리 목적이 달성된 개인정보는 별도의
            DB로 이동하여 일정 기간 후 파기합니다.
          </li>
          <li>
            <strong>파기 방법:</strong> 전자적 파일은 복구 불가능한 방법으로 삭제하며, 종이에 출력된
            정보는 분쇄하여 파기합니다.
          </li>
        </ul>
      </section>

      <section>
        <h3 className="text-foreground mb-2 font-semibold">7. 이용자의 권리와 행사 방법</h3>
        <p className="mb-2">회원은 언제든지 다음 권리를 행사할 수 있습니다.</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>개인정보 열람, 정정, 삭제 요청</li>
          <li>개인정보 처리 정지 요청</li>
          <li>회원 탈퇴 (서비스 내 설정에서 직접 처리 가능)</li>
        </ul>
      </section>

      <section>
        <h3 className="text-foreground mb-2 font-semibold">8. 쿠키의 운용 및 관리</h3>
        <p>
          회사는 로그인 세션 유지 및 서비스 품질 향상을 위해 쿠키를 사용합니다. 회원은 브라우저
          설정을 통해 쿠키를 거부할 수 있으나, 이 경우 일부 서비스 이용이 제한될 수 있습니다.
        </p>
      </section>

      <section>
        <h3 className="text-foreground mb-2 font-semibold">9. 개인정보의 안전성 확보 조치</h3>
        <ul className="list-disc space-y-0.5 pl-5">
          <li>모든 통신에 HTTPS(TLS) 암호화 적용</li>
          <li>비밀번호 등 민감 정보의 암호화 저장</li>
          <li>접근 권한 최소화 및 관리</li>
          <li>보안 취약점 모니터링 및 대응</li>
        </ul>
      </section>

      <section>
        <h3 className="text-foreground mb-2 font-semibold">10. 개인정보 보호책임자</h3>
        <div className="bg-muted/30 rounded-md p-3">
          <ul className="space-y-1">
            <li>
              <strong>회사명:</strong> {BUSINESS_INFO.company}
            </li>
            <li>
              <strong>서비스명:</strong> 공놀이판 (gongnori.fan)
            </li>
            {isBusinessInfoConfigured() && (
              <li>
                <strong>개인정보 보호책임자:</strong> {BUSINESS_INFO.ceo} (직책: 대표)
              </li>
            )}
            <li>
              <strong>문의:</strong>{" "}
              {isContactEmailConfigured() ? BUSINESS_INFO.contactEmail : "서비스 내 문의 기능"}
            </li>
          </ul>
        </div>
      </section>

      <section>
        <h3 className="text-foreground mb-2 font-semibold">11. 개인정보처리방침의 변경</h3>
        <p>
          본 방침이 변경되는 경우 시행 7일 전(이용자 권리에 중대한 변경이 있는 경우 30일 전)부터
          서비스 내 공지사항을 통해 고지합니다.
        </p>
      </section>

      <section className="border-border border-t pt-4">
        <p className="text-muted-foreground text-[12px]">
          본 개인정보처리방침은 2026년 3월 3일 최초 시행, 2026년 7월 29일 개정·시행합니다.
        </p>
      </section>
    </div>
  )
}
