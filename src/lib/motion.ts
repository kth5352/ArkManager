// Shared motion constants (docs/superpowers/specs/2026-09-09-ui-renewal-design.md
// section 4) - seconds for framer-motion props (its `transition.duration` unit),
// separately documented in ms for the matching Tailwind `duration-*` CSS
// utility classes used alongside plain CSS transitions (button hover/press,
// Radix popup data-state fades). Both must describe the same physical
// duration for a given interaction - kept in one file so they can't drift.
export const UI_MOTION = {
  fast: 0.12,
  normal: 0.16,
  selection: 0.18,
  panel: 0.2,
  ease: [0.22, 1, 0.36, 1] as const,
  tooltipDelayMs: 400,
} as const
