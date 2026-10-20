import { useLocation } from "@tanstack/react-router"
import * as React from "react"
import {
  Check,
  ChevronsUpDown,
  LogOut,
  Plus,
  Search,
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
  SidebarInput,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"
import { useAuthUser } from "@/features/dashboard/auth-user"
import { useData } from "@/features/dashboard/data-provider"
import { useMatchmaking } from "@/features/play/matchmaking"
import { ProfileDialog } from "@/features/dashboard/profile-dialog"
import { AppReviewDialog } from "@/features/app-review/app-review-dialog"
import { venueBase } from "@/features/venue/nav"
import { navContext } from "@/features/dashboard/workspace"
import { m } from "@/paraglide/messages"

export function AppSidebar() {
  const pathname = useLocation({ select: (l) => l.pathname })
  const { signOut, openUserProfile } = useClerk()
  const { isMobile, setOpenMobile } = useSidebar()
  const { userName } = useMatchmaking()
  const { user: USER, brand: BRAND, venues: VENUES, accountType } = useData()
  const venueOnly = accountType === "venue"

  // The signed-in user, fetched server-side (no session-load flash). This
  // sidebar only renders inside the guarded dashboard, so a user is guaranteed.
  const sUser = useAuthUser()

  const [profileOpen, setProfileOpen] = React.useState(false)
  const [reviewOpen, setReviewOpen] = React.useState(false)

  const { workspace, group, items, active, venueId } = navContext(pathname)
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
    <Sidebar variant="inset" collapsible="icon">
      <SidebarHeader className="gap-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenuTrigger>
              <SidebarMenuButton
                size="lg"
                className="aria-expanded:bg-sidebar-accent"
              >
                <div
                  className={cn(
                    "flex aspect-square size-10 items-center justify-center rounded-xl",
                    (isVenue || isAdmin) &&
                      "bg-secondary text-xs font-bold text-secondary-foreground"
                  )}
                >
                  {isAdmin ? (
                    <ShieldCheck className="size-5" />
                  ) : isVenue && VENUE ? (
                    VENUE.initials
                  ) : (
                    <LogoMark className="size-9! text-primary" />
                  )}
                </div>
                <div className="grid flex-1 text-left leading-tight">
                  <span className="truncate font-heading text-sm font-bold tracking-tight">
                    {isAdmin
                      ? m.sidebar_admin_workspace()
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
          </SidebarMenuItem>
        </SidebarMenu>

        <div className="relative group-data-[collapsible=icon]:hidden">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <SidebarInput
            placeholder={
              isVenue
                ? m.sidebar_search_venue()
                : m.sidebar_search_placeholder()
            }
            className="pl-8"
            aria-label={
              isVenue
                ? m.sidebar_search_venue()
                : m.sidebar_search_placeholder()
            }
          />
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{group()}</SidebarGroupLabel>
          <SidebarMenu>
            {items
              .filter((item) => !item.hidden)
              .map((item) => (
                <SidebarMenuItem key={item.key}>
                  <SidebarMenuButton
                    isActive={item.key === active.key}
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
      </SidebarContent>

      <SidebarFooter>
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <SidebarMenu className="min-w-0 flex-1">
              <SidebarMenuItem>
                <DropdownMenuTrigger>
                  <SidebarMenuButton
                    size="lg"
                    className="aria-expanded:bg-sidebar-accent"
                  >
                    <Avatar size="sm" className="size-8">
                      {accountImage ? (
                        <AvatarImage src={accountImage} alt={accountName} />
                      ) : null}
                      <AvatarFallback className="bg-secondary text-xs font-medium text-secondary-foreground">
                        {accountInitials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="grid flex-1 text-left leading-tight">
                      <span className="truncate text-sm font-medium">
                        {accountName}
                      </span>
                      <span className="truncate text-xs text-sidebar-foreground/60">
                        {accountSubtitle}
                      </span>
                    </div>
                    <ChevronsUpDown className="ml-auto size-4 text-sidebar-foreground/60" />
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
                          <AvatarFallback className="bg-secondary text-xs font-medium text-secondary-foreground">
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

      <SidebarRail />

      <ProfileDialog open={profileOpen} onOpenChange={setProfileOpen} />
      <AppReviewDialog open={reviewOpen} onOpenChange={setReviewOpen} />
    </Sidebar>
  )
}
