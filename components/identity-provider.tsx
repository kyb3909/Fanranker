'use client'

import { createContext, useContext, useEffect, useState, useCallback } from 'react'

export type Identity = 'sports' | 'culture' | 'hybrid'

interface IdentityContextValue {
  identity: Identity
  setIdentity: (identity: Identity) => void
}

const IdentityContext = createContext<IdentityContextValue | undefined>(undefined)

const STORAGE_KEY = 'fanranker-identity'

export function IdentityProvider({ children }: { children: React.ReactNode }) {
  const [identity, setIdentityState] = useState<Identity>('sports')

  // Read from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'culture' || stored === 'hybrid' || stored === 'sports') {
      setIdentityState(stored)
    }
  }, [])

  const setIdentity = useCallback((next: Identity) => {
    setIdentityState(next)
    localStorage.setItem(STORAGE_KEY, next)

    if (next === 'sports') {
      document.documentElement.removeAttribute('data-identity')
    } else {
      document.documentElement.setAttribute('data-identity', next)
    }
  }, [])

  // Sync DOM attribute on mount (covers SSR hydration)
  useEffect(() => {
    if (identity === 'sports') {
      document.documentElement.removeAttribute('data-identity')
    } else {
      document.documentElement.setAttribute('data-identity', identity)
    }
  }, [identity])

  return (
    <IdentityContext.Provider value={{ identity, setIdentity }}>
      {children}
    </IdentityContext.Provider>
  )
}

export function useIdentity() {
  const ctx = useContext(IdentityContext)
  if (!ctx) throw new Error('useIdentity must be used within IdentityProvider')
  return ctx
}
