interface AdPlaceholderProps {
  variant: "banner" | "sidebar" | "inline"
}

const VARIANT_CONFIG = {
  banner: {
    dimensions: "728x90",
    className: "w-full h-[90px]",
  },
  sidebar: {
    dimensions: "300x250",
    className: "w-full aspect-[300/250]",
  },
  inline: {
    dimensions: "468x60",
    className: "w-full h-[60px]",
  },
} as const

export function AdPlaceholder({ variant }: AdPlaceholderProps) {
  const config = VARIANT_CONFIG[variant]

  return (
    <div
      className={`${config.className} border-border flex flex-col items-center justify-center overflow-hidden rounded-xl border border-dashed`}
    >
      <span className="text-muted-foreground text-[11px] font-bold tracking-wider">AD</span>
      <span className="text-muted-foreground text-[10px]">{config.dimensions}</span>
    </div>
  )
}
