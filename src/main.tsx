import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Button } from './components/ui/button'
import './globals.css'

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('Root element #root not found')

createRoot(rootEl).render(
  <StrictMode>
    <div className="flex h-screen items-center justify-center gap-2 bg-background text-foreground">
      DLibrary
      <Button>Test</Button>
    </div>
  </StrictMode>
)
