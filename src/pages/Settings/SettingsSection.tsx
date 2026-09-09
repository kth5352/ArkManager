import type { ReactNode } from 'react'

// U6 (UI renewal plan): wraps the existing per-topic sections
// (LocaleEmulatorSection, LanguageSection, etc.) into a labeled card, so
// SettingsPage reads as grouped topics instead of one long list separated
// only by border-top dividers. aria-labelledby ties the visible heading to
// the section landmark for assistive tech, matching each section's own id.
export function SettingsSection({
  id,
  title,
  description,
  children,
}: {
  id: string
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <section aria-labelledby={id} className="rounded-xl border bg-card p-5">
      <h2 id={id} className="text-sm font-semibold">
        {title}
      </h2>
      {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
      <div className="mt-4 space-y-3">{children}</div>
    </section>
  )
}
