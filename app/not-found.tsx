import type { Metadata } from "next"
import Link from "@/components/ui/app-link"
import { MascotImg } from "@/components/mascot-img"

export const metadata: Metadata = {
  title: "페이지를 찾을 수 없습니다",
  robots: { index: false, follow: false },
}

export default function NotFound() {
  return (
    <div className="worldcup-scope flex min-h-screen items-center justify-center px-4">
      <div className="text-center" style={{ maxWidth: 360 }}>
        <MascotImg />
        <h1
          style={{
            fontSize: 22,
            fontWeight: 900,
            color: "var(--wc-ink)",
            marginBottom: 8,
            wordBreak: "keep-all",
          }}
        >
          길을 잃었구너…
        </h1>
        <p style={{ fontSize: 14, color: "var(--wc-mute)", marginBottom: 24, lineHeight: 1.6 }}>
          요청하신 페이지가 존재하지 않거나 이동되었습니다.
        </p>
        <Link
          href="/"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            height: 44,
            padding: "0 24px",
            borderRadius: 10,
            fontSize: 14,
            fontWeight: 700,
            background: "var(--wc-burgundy)",
            color: "#fff",
            textDecoration: "none",
          }}
        >
          홈으로
        </Link>
      </div>
    </div>
  )
}
