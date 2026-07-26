import type { ReactNode } from 'react'

export function AppLayout({ children }: { children: ReactNode }) {
  return <div className="flex h-screen bg-background text-foreground">{children}</div>
}
