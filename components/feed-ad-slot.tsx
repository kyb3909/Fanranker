"use client"

/**
 * 피드 내 광고 슬롯 (AdSense 연동용)
 * - NEXT_PUBLIC_ADSENSE_CLIENT_ID, NEXT_PUBLIC_ADSENSE_SLOT_ID 설정 시 실제 광고 노출
 * - 미설정 시 플레이스홀더 표시
 */
export function FeedAdSlot({ slotId }: { slotId?: string }) {
  const clientId = process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID
  const slot = slotId || process.env.NEXT_PUBLIC_ADSENSE_SLOT_ID || ""

  if (!clientId || !slot) {
    return (
      <div className="bg-muted/30 border border-dashed border-border rounded-xl min-h-[100px] flex items-center justify-center my-3">
        <p className="text-[12px] text-muted-foreground">광고 영역</p>
      </div>
    )
  }

  return (
    <div className="my-3 flex justify-center min-h-[100px]">
      <ins
        className="adsbygoogle"
        style={{ display: "block" }}
        data-ad-client={clientId}
        data-ad-slot={slot}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </div>
  )
}
