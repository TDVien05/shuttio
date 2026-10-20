import * as React from "react"
import { ThemeProvider as BetterThemesProvider } from "better-themes"

/**
 * The product ships light-only: `forcedTheme` ignores a previously stored
 * preference and the OS setting, so every route renders the light palette.
 * The provider stays mounted because `useTheme()` consumers (toasts, map
 * tiles) still read the resolved theme.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <BetterThemesProvider
      attribute="class"
      defaultTheme="light"
      forcedTheme="light"
      enableSystem={false}
      disableTransitionOnChange
    >
      {children}
    </BetterThemesProvider>
  )
}
