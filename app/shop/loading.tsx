export default function ShopLoading() {
  return (
    <div className="bg-background flex min-h-[60vh] items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="bg-muted h-10 w-10 animate-pulse rounded-full" />
        <div className="bg-muted h-3 w-24 animate-pulse rounded" />
      </div>
    </div>
  )
}
