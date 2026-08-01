import type { ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useRouterState } from '@tanstack/react-router'
import { Sidebar } from './Sidebar'
import { BulkCrawlProgressBanner } from './BulkCrawlProgressBanner'
import { useBulkCrawlProgress } from '../../hooks/useBulkCrawlMissingMetadata'
import { MediaPlayerHost } from '../media/MediaPlayerHost'
import { useMediaPlayerSync } from '../../hooks/useMediaPlayerSync'

export function AppLayout({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const bulkCrawlProgress = useBulkCrawlProgress()
  useMediaPlayerSync()

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="flex-1 overflow-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={pathname}
              className="h-full"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15 }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
      <MediaPlayerHost />
      <BulkCrawlProgressBanner progress={bulkCrawlProgress} />
    </div>
  )
}
