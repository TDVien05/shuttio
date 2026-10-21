import { useLocation } from "@tanstack/react-router"
import * as React from "react"
import {
  Check,
  ChevronsUpDown,
  LogOut,
  MoreHorizontal,
  Plus,
  Settings,
  ShieldCheck,
  Star,
  UserCog,
  UserRound,
} from "lucide-react"
import { useClerk } from "@clerk/react"
import { initialsOf } from "@/lib/shared"

import { LogoMark } from "@/components/logo"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar"
import { useAuthUser } from "@/features/dashboard/hooks/use-auth-user"
import { useData } from "@/features/dashboard/components/data-provider"
import { usePlayerIdentity } from "@/features/play/hooks/use-player-identity"
import { ProfileDialog } from "@/features/dashboard/components/profile-dialog"
import { AppReviewDialog } from "@/features/app-review/components/app-review-dialog"
import { venueBase } from "@/features/venue/nav"
import { navContext } from "@/features/dashboard/lib/workspace"
import { m } from "@/paraglide/messages"

export function AppSidebar() {
  const pathname = useLocation({ select: (l) => l.pathname })
  const { signOut, openUserProfile } = useClerk()
  const { isMobile, setOpenMobile } = useSidebar()
  const { userName } = usePlayerIdentity()
  const { user: USER, brand: BRAND, venues: VENUES, accountType } = useData()
  const venueOnly = accountType === "venue"

  // The signed-in user, fetched server-side (no session-load flash). This
  // sidebar only renders inside the guarded dashboard, so a user is guaranteed.
  const sUser = useAuthUser()

  const [profileOpen, setProfileOpen] = React.useState(false)
  const [reviewOpen, setReviewOpen] = React.useState(false)

  const { workspace, items, active, venueId } = navContext(pathname)
  // Consecutive items sharing a `group` heading form one sidebar group; items
  // with none sit in the first, unlabeled group.
  const navGroups = items
    .filter((item) => !item.hidden)
    .reduce<{ label?: string; items: typeof items }[]>((acc, item) => {
      const label = item.group?.()
      const last = acc.at(-1)
      if (last && last.label === label) last.items.push(item)
      else acc.push({ label, items: [item] })
      return acc
    }, [])
  const isVenue = workspace === "venue"
  const isAdmin = workspace === "admin"

  // The active venue is derived from the URL's [venueId] (per-venue workspace).
  // In the player workspace there's no active venue, so fall back to the
  // account's venue (if any) as the representative for the switcher tile/icon.
  // A brand-new account owns no venue until it runs the setup wizard, so this
  // can be undefined — every read below guards for that.
  const activeVenueId = venueId
  const VENUE =
    (venueId && VENUES.find((v) => v.id === venueId)) || VENUES.at(0)

  const displayName = isVenue && VENUE ? VENUE.manager.name : userName

  // The footer account menu reflects the *real* signed-in user — name, email
  // and avatar pulled from the Clerk session — independent of the mock
  // player/venue identity used everywhere else. Fall back to the mock identity
  // while the session is loading or absent.
  const accountName = sUser.name || displayName
  const accountSubtitle =
    sUser.email || (isVenue && VENUE ? m.sidebar_operator_role() : USER.handle)
  const accountImage = sUser.image || undefined
  const accountInitials = sUser.name
    ? initialsOf(sUser.name)
    : isVenue && VENUE
      ? VENUE.manager.initials
      : USER.initials

  const handleNavigate = () => {
    if (isMobile) setOpenMobile(false)
  }

  const handleSignOut = () => void signOut({ redirectUrl: "/" })

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="px-3 pt-4 pb-2">
        <SidebarMenu>
          <SidebarMenuItem className="flex items-center gap-1">
            <DropdownMenuTrigger>
              <SidebarMenuButton
                size="lg"
                className="h-12 min-w-0 flex-1 rounded-xl aria-expanded:bg-sidebar-accent"
              >
                <LogoMark className="size-8! shrink-0 text-primary" />
                <div className="grid flex-1 text-left leading-tight">
                  <span className="truncate font-heading text-sm font-bold tracking-tight">
                    {isAdmin
                      ? m.admin_nav_group()
                      : isVenue && VENUE
                        ? VENUE.name
                        : m.common_app_name()}
                  </span>
                  {isVenue && VENUE ? (
                    <span className="truncate text-xs text-sidebar-foreground/60">
                      {`${m.sidebar_venue_tag()} · ${VENUE.ward}`}
                    </span>
                  ) : null}
                </div>
                <ChevronsUpDown className="ml-auto size-4 text-sidebar-foreground/60" />
              </SidebarMenuButton>
              <DropdownMenu offset={6} className="min-w-56">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>
                    {m.sidebar_workspaces()}
                  </DropdownMenuLabel>
                  {venueOnly ? (
                    <DropdownMenuItem
                      href="/assessment"
                      onAction={handleNavigate}
                    >
                      <div className="flex size-6 items-center justify-center rounded-lg border border-dashed border-sidebar-border text-secondary-foreground">
                        <Plus className="size-4" />
                      </div>
                      <span className="flex-1">
                        {m.sidebar_become_player()}
                      </span>
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem href="/app" onAction={handleNavigate}>
                      <LogoMark className="size-6 text-primary" />
                      <span className="flex-1">
                        {m.sidebar_player_workspace()}
                      </span>
                      {workspace === "player" ? (
                        <Check className="size-4 text-brand" />
                      ) : null}
                    </DropdownMenuItem>
                  )}
                  {sUser.role === "admin" ? (
                    <DropdownMenuItem
                      href="/app/admin"
                      onAction={handleNavigate}
                    >
                      <ShieldCheck className="size-6 text-primary" />
                      <span className="flex-1">
                        {m.sidebar_admin_workspace()}
                      </span>
                      {isAdmin ? <Check className="size-4 text-brand" /> : null}
                    </DropdownMenuItem>
                  ) : null}
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  {/* The brand (thương hiệu) and its branches (chi nhánh). */}
                  <DropdownMenuLabel className="truncate">
                    {BRAND ? BRAND.name : m.sidebar_venue_tag()}
                  </DropdownMenuLabel>
                  {VENUES.length > 0 ? (
                    <>
                      {VENUES.map((v) => (
                        <DropdownMenuItem
                          key={v.id}
                          href={venueBase(v.id)}
                          onAction={handleNavigate}
                        >
                          <div className="flex size-7 items-center justify-center rounded-lg bg-secondary text-xs font-semibold text-secondary-foreground">
                            {v.initials}
                          </div>
                          <span className="flex-1 truncate">{v.name}</span>
                          {isVenue && v.id === activeVenueId ? (
                            <Check className="size-4 text-brand" />
                          ) : null}
                        </DropdownMenuItem>
                      ))}
                      {/* `?branch=1` lets the one-shot setup wizard add another branch. */}
                      <DropdownMenuItem
                        href="/setup?branch=1"
                        onAction={handleNavigate}
                      >
                        <div className="flex size-7 items-center justify-center rounded-lg border border-dashed border-sidebar-border text-secondary-foreground">
                          <Plus className="size-4" />
                        </div>
                        <span className="flex-1 truncate">
                          {m.sidebar_add_branch()}
                        </span>
                      </DropdownMenuItem>
                    </>
                  ) : (
                    <DropdownMenuItem href="/setup" onAction={handleNavigate}>
                      <div className="flex size-7 items-center justify-center rounded-lg border border-dashed border-sidebar-border text-secondary-foreground">
                        <Plus className="size-4" />
                      </div>
                      <span className="flex-1 truncate">
                        {m.sidebar_add_venue()}
                      </span>
                    </DropdownMenuItem>
                  )}
                </DropdownMenuGroup>
                {isVenue && VENUE ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuGroup>
                      <DropdownMenuItem
                        href={`${venueBase(VENUE.id)}/manage`}
                        onAction={handleNavigate}
                      >
                        <Settings className="size-4" />
                        <span className="flex-1">
                          {m.sidebar_manage_venue()}
                        </span>
                      </DropdownMenuItem>
                    </DropdownMenuGroup>
                  </>
                ) : null}
              </DropdownMenu>
            </DropdownMenuTrigger>
            <SidebarTrigger className="shrink-0 group-data-[collapsible=icon]:hidden" />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent className="px-3">
        {navGroups.map((g) => (
          <SidebarGroup key={g.label ?? "main"} className="p-0 pt-2">
            {g.label ? <SidebarGroupLabel>{g.label}</SidebarGroupLabel> : null}
            <SidebarMenu>
              {g.items.map((item) => (
                <SidebarMenuItem key={item.key}>
                  <SidebarMenuButton
                    isActive={item.key === active.key}
                    className="h-10 rounded-full px-4"
                    tooltip={item.label()}
                    href={item.href}
                    onPress={handleNavigate}
                  >
                    <item.icon />
                    <span>{item.label()}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="gap-0 px-3 pb-0">
        <div className="mt-2 flex h-12 items-center">
          <div className="flex w-full items-center gap-3">
            <SidebarMenu className="min-w-0 flex-1">
              <SidebarMenuItem>
                <DropdownMenuTrigger>
                  <SidebarMenuButton
                    size="lg"
                    className="h-10 rounded-xl border border-sidebar-border bg-background aria-expanded:bg-sidebar-accent"
                  >
                    <Avatar size="sm" className="size-8">
                      {accountImage ? (
                        <AvatarImage src={accountImage} alt={accountName} />
                      ) : null}
                      <AvatarFallback
                        tone="secondary"
                        size="xs"
                        weight="medium"
                      >
                        {accountInitials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="grid flex-1 text-left leading-tight">
                      <span className="truncate text-sm font-medium">
                        {accountName}
                      </span>
                    </div>
                    <MoreHorizontal className="ml-auto size-4 text-sidebar-foreground/60" />
                  </SidebarMenuButton>
                  <DropdownMenu
                    placement="top end"
                    offset={6}
                    className="min-w-56"
                  >
                    <DropdownMenuGroup>
                      <DropdownMenuLabel className="flex items-center gap-2 py-2 text-foreground">
                        <Avatar size="sm" className="size-8">
                          {accountImage ? (
                            <AvatarImage src={accountImage} alt={accountName} />
                          ) : null}
                          <AvatarFallback
                            tone="secondary"
                            size="xs"
                            weight="medium"
                          >
                            {accountInitials}
                          </AvatarFallback>
                        </Avatar>
                        <div className="grid leading-tight">
                          <span className="text-sm font-medium">
                            {accountName}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {accountSubtitle}
                          </span>
                        </div>
                      </DropdownMenuLabel>
                    </DropdownMenuGroup>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onAction={() => setProfileOpen(true)}>
                      <UserRound />
                      {m.sidebar_profile()}
                    </DropdownMenuItem>
                    <DropdownMenuItem onAction={() => openUserProfile()}>
                      <UserCog />
                      {m.sidebar_account_settings()}
                    </DropdownMenuItem>
                    <DropdownMenuItem onAction={() => setReviewOpen(true)}>
                      <Star />
                      {m.sidebar_rate_app()}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      onAction={handleSignOut}
                    >
                      <LogOut />
                      {m.sidebar_logout()}
                    </DropdownMenuItem>
                  </DropdownMenu>
                </DropdownMenuTrigger>
              </SidebarMenuItem>
            </SidebarMenu>
          </div>
        </div>
      </SidebarFooter>

      <ProfileDialog open={profileOpen} onOpenChange={setProfileOpen} />
      <AppReviewDialog open={reviewOpen} onOpenChange={setReviewOpen} />
    </Sidebar>
  )
}
