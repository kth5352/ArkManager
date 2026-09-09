import type { Config } from 'tailwindcss'

export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        // 'Pretendard Variable'가 없으면(예: 폰트 로드 실패) 각 OS의 기본 시스템
        // UI 폰트로, 그마저 없으면 일본어/한국어 시스템 폰트로 순서대로 폴백.
        // 일본어(ja) 로케일: Pretendard는 일본어 글리프를 포함하지 않으므로
        // 자동으로 다음 폰트(시스템 UI 폰트)로 폴백된다 - 별도 분기 불필요.
        sans: [
          'Pretendard Variable',
          '-apple-system',
          'BlinkMacSystemFont',
          'system-ui',
          'Roboto',
          'Helvetica Neue',
          'Segoe UI',
          'Apple SD Gothic Neo',
          'Noto Sans KR',
          'Malgun Gothic',
          'sans-serif',
        ],
      },
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: 'hsl(var(--card))',
        'card-foreground': 'hsl(var(--card-foreground))',
        border: 'hsl(var(--border))',
        accent: 'hsl(var(--accent))',
        'accent-foreground': 'hsl(var(--accent-foreground))',
        primary: 'hsl(var(--primary))',
        'primary-foreground': 'hsl(var(--primary-foreground))',
        secondary: 'hsl(var(--secondary))',
        'secondary-foreground': 'hsl(var(--secondary-foreground))',
        muted: 'hsl(var(--muted))',
        'muted-foreground': 'hsl(var(--muted-foreground))',
        destructive: 'hsl(var(--destructive))',
        'destructive-foreground': 'hsl(var(--destructive-foreground))',
        popover: 'hsl(var(--popover))',
        'popover-foreground': 'hsl(var(--popover-foreground))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
      },
      borderRadius: {
        md: 'var(--radius)',
      },
      // duration-120/160 - not in Tailwind's default duration scale
      // (75/100/150/200/300/500/700/1000) - match the exact ms values design
      // §4's motion contract specifies (button hover/press color transition,
      // Radix popup fade+zoom) so callers can write duration-120/duration-160
      // instead of an arbitrary-value duration-[120ms]/duration-[160ms].
      transitionDuration: {
        '120': '120ms',
        '160': '160ms',
      },
      // z-80/z-100 - not in Tailwind's default z-index scale (0/10/20/30/40/
      // 50/auto). design §5's layering: tooltip 100 > popup (popover/
      // dropdown/context-menu/select content) 80 > existing fullscreen media
      // 50 / media sidebar 60, both left untouched elsewhere. Dialog's own
      // z-50 is also left untouched - it already has its own
      // deliberately-lower-than-media-sidebar relationship (see
      // DialogContent's overlayClassName escape hatch), which this task does
      // not change.
      zIndex: {
        '80': '80',
        '100': '100',
      },
    },
  },
  plugins: [],
} satisfies Config
