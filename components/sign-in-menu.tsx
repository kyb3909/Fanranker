'use client'

import { SignIn } from '@clerk/nextjs'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { User } from 'lucide-react'

export function SignInMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full">
          <User className="h-[18px] w-[18px]" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        className="w-[400px] p-0 mt-2 bg-card border border-border shadow-lg rounded-xl overflow-hidden"
      >
        <SignIn
          appearance={{
            elements: {
              rootBox: 'w-full',
              card: 'w-full shadow-none border-0 rounded-none bg-transparent',
              headerTitle: 'text-foreground text-xl font-bold',
              headerSubtitle: 'text-muted-foreground text-sm',
              socialButtonsBlockButton: 'bg-background border border-border text-foreground hover:bg-muted transition-colors',
              socialButtonsBlockButtonText: 'text-foreground font-medium',
              formFieldInput: 'bg-background border border-border text-foreground placeholder:text-muted-foreground',
              formButtonPrimary: 'bg-primary text-primary-foreground hover:bg-primary/90',
              footerActionLink: 'text-primary hover:text-primary/80',
              identityPreviewText: 'text-foreground',
              identityPreviewEditButton: 'text-primary',
              formFieldLabel: 'text-foreground',
              dividerLine: 'bg-border',
              dividerText: 'text-muted-foreground',
              footer: 'hidden', // Clerk 브랜딩 숨김
              footerPages: 'hidden', // Clerk 브랜딩 숨김
            },
            layout: {
              showOptionalFields: false,
            }
          }}
          routing="hash"
          signUpUrl="#"
        />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
