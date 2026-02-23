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
      className={`${config.className} flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 bg-muted/30`}
    >
      <span className="text-[11px] font-bold tracking-wider text-muted-foreground/50">
        AD
      </span>
      <span className="text-[10px] text-muted-foreground/40">
        {config.dimensions}
      </span>
    </div>
  )
}
