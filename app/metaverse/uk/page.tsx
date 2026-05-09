"use client"

import Image from "next/image"
import Link from "next/link"

const ENG_RATIO = 1122 / 1402

export default function UkMetaversePage() {
  return (
    <div className="flex items-center justify-center p-2" style={{ height: "calc(100vh - 100px)" }}>
      <div
        className="relative max-h-full max-w-full overflow-hidden rounded-lg bg-[#0d2b46]"
        style={{ aspectRatio: ENG_RATIO, height: "calc(100vh - 120px)" }}
      >
        <Image
          src="/map_gb/eng.png"
          alt="영국 월드맵"
          fill
          priority
          className="object-contain"
          sizes="100vw"
        />

        {/* 웸블리 → /metaverse/highbury */}
        <Link
          href="/metaverse/highbury"
          aria-label="잉글랜드 (웸블리) 입장"
          className="absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer transition-transform duration-200 hover:z-10 hover:scale-110"
          style={{
            top: "78%",
            left: "42%",
            width: "14%",
            filter: "drop-shadow(2px 4px 4px rgba(0,0,0,0.4))",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/map_gb/wem-remove.png" alt="웸블리" className="block h-auto w-full" />
        </Link>
      </div>
    </div>
  )
}
