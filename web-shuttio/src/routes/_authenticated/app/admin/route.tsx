import { Navigate, Outlet, createFileRoute } from "@tanstack/react-router"
import { useAuthUser } from "@/features/dashboard/hooks/use-auth-user"

export const Route = createFileRoute("/_authenticated/app/admin")({
  component: AdminLayout,
})

function AdminLayout() {
  const user = useAuthUser()
  if (user.role !== "admin") {
    return <Navigate to="/app" replace />
  }
  return <Outlet />
}
