/**
 * 월드컵 승부 예측 규칙 본문 — 모달과 슬립 하단 카드에서 공용.
 * 순수 JSX(훅 없음)라 서버/클라이언트 어디서나 사용 가능.
 */
export function WorldcupRulesContent() {
  return (
    <div
      className="space-y-3.5 text-[14px] leading-relaxed"
      style={{ color: "var(--wc-ink-2, #494d56)", wordBreak: "keep-all" }}
    >
      <p>
        예측에 사용되는 <b style={{ color: "var(--wc-ink)" }}>기회(볼)</b>는 매일{" "}
        <b style={{ color: "var(--wc-ink)" }}>10개씩</b> 충전되고, 소진되지 않은 볼은 그대로
        사라집니다.
      </p>
      <p>
        예측할 수 있는 경기는 <b style={{ color: "var(--wc-ink)" }}>하루 24시간 분량</b>으로 정해져
        있고, 경기 목록은 <b style={{ color: "var(--wc-ink)" }}>매일 밤 11시</b>에 새로 바뀝니다.
      </p>
      <p>
        새로 바뀐 목록에는{" "}
        <b style={{ color: "var(--wc-ink)" }}>오전 8시 이후 경기부터 그 다음날 오전 8시까지</b> 총
        24시간의 경기가 담깁니다.
      </p>
    </div>
  )
}
