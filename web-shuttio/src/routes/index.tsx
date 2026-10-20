import { createFileRoute } from "@tanstack/react-router"

import { Logo } from "@/components/logo"

export const Route = createFileRoute("/")({
  ssr: true,
  component: Landing,
})

function Landing() {
  return (
    <main className="grid min-h-svh place-items-center">
      <Logo />
    </main>
  )
}
