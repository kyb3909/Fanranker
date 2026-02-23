'use client'

import { SignUp } from '@clerk/nextjs'

export default function SignUpPage() {
  return (
    <main id="main-content" tabIndex={-1} className="min-h-screen flex items-center justify-center bg-background">
      <SignUp
        appearance={{
          elements: {
            rootBox: 'mx-auto',
            card: 'shadow-md border border-border bg-card',
            headerTitle: 'text-foreground text-xl font-bold',
            headerSubtitle: 'text-muted-foreground text-sm',
            formFieldInput: 'bg-background border border-border text-foreground',
            formButtonPrimary: 'bg-primary text-primary-foreground hover:bg-primary/90',
            footerActionLink: 'text-primary hover:text-primary/80',
            footerPages: '!hidden',
            internal: '!hidden',
            badge: '!hidden',
            poweredBy: '!hidden',
          },
          layout: {
            showOptionalFields: false,
            unsafe_disableDevelopmentModeWarnings: true,
          }
        }}
        signInUrl="/"
      />
    </main>
  )
}
