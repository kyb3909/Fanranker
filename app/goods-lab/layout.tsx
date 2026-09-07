import { InterestProvider } from "./interest-provider"

export default function GoodsLabLayout({ children }: { children: React.ReactNode }) {
  return <InterestProvider>{children}</InterestProvider>
}
