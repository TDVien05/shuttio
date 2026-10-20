import { Outlet, useLocation } from "@tanstack/react-router"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { AppSidebar } from "@/features/dashboard/app-sidebar"
import { DashboardTopbar } from "@/features/dashboard/topbar"

export function DashboardFrame() {
  const pathname = useLocation({ select: (l) => l.pathname })
  // Home, player play, player chat, and bookings share the same blue
  // header and drop the sidebar. The venue operator inbox and other dashboard
  // routes keep the inset sidebar layout.
  const isHome = pathname === "/app"
  const isPlayerChat = pathname === "/app/chat"
  const isPlayerBookings = pathname === "/app/bookings"
  const isPlayerPlay = pathname === "/app/play"
  const isPlayerBook = pathname === "/app/book"
  // The VietQR payment screen (/app/payment/<id>) is part of the player flow.
  const isPlayerPayment = pathname.startsWith("/app/payment/")
  // The venue messages page needs full-height chat layout (no scroll padding).
  const isVenueMessages = /^\/app\/venue\/[^/]+\/messages$/.test(pathname)
  const isPlayerSurface =
    isHome ||
    isPlayerChat ||
    isPlayerBookings ||
    isPlayerPlay ||
    isPlayerBook ||
    isPlayerPayment

  return (
    <SidebarProvider className="font-geist h-svh">
      {!isPlayerSurface && <AppSidebar />}
      <SidebarInset className="overflow-hidden">
        <DashboardTopbar />
        <main
          className={
            isHome ||
            isPlayerBookings ||
            isPlayerPlay ||
            isPlayerBook ||
            isPlayerPayment
              ? "min-h-0 flex-1 overflow-y-auto bg-white pb-16 md:pb-0"
              : isPlayerChat
                ? "min-h-0 min-w-0 flex-1 overflow-hidden bg-background pb-16 md:pb-0"
                : isVenueMessages
                  ? "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
                  : "min-h-0 flex-1 overflow-y-auto p-4 sm:p-6"
          }
        >
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
