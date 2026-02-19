'use client'

import { useIdentity, type Identity } from './identity-provider'
import { Palette, Sparkles } from 'lucide-react'

function SoccerBall({ className, strokeWidth }: { className?: string; strokeWidth?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth ?? 2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2l1.5 5.5L18 6l-1 5.5 5 2.5-4 4 1.5 5-5-1.5L12 22l-2.5-4.5-5 1.5 1.5-5-4-4 5-2.5L6 6l4.5 1.5z" />
    </svg>
  )
}

const IDENTITIES: { value: Identity; label: string; color: string; icon: React.FC<{ className?: string; strokeWidth?: number }> }[] = [
  { value: 'sports', label: '스포츠', color: 'oklch(0.45 0.18 15)', icon: SoccerBall },
  { value: 'culture', label: '문화', color: 'oklch(0.50 0.18 255)', icon: Palette },
  { value: 'hybrid', label: '하이브리드', color: 'oklch(0.45 0.18 300)', icon: Sparkles },
]

export function IdentitySwitcher() {
  const { identity, setIdentity } = useIdentity()

  return (
    <div role="radiogroup" aria-label="아이덴티티 테마" className="flex items-center gap-1.5">
      {IDENTITIES.map(({ value, label, color, icon: Icon }) => {
        const selected = identity === value
        return (
          <button
            key={value}
            role="radio"
            aria-checked={selected}
            aria-label={label}
            title={label}
            onClick={() => setIdentity(value)}
            className="relative flex items-center justify-center rounded-full transition-all duration-150"
            style={{
              width: 28,
              height: 28,
              backgroundColor: color,
              opacity: selected ? 1 : 0.5,
              boxShadow: selected ? '0 0 0 2px rgba(255,255,255,0.9)' : 'none',
            }}
          >
            <Icon className="h-3.5 w-3.5 text-white" strokeWidth={2.5} />
          </button>
        )
      })}
    </div>
  )
}
