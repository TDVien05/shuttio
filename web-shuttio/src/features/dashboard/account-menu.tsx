import * as React from "react"
import { useClerk } from "@clerk/react"
import { LogOut, ShieldCheck, Star, UserCog, UserRound } from "lucide-react"

import { LogoMark } from "@/components/logo"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { initialsOf } from "@/lib/shared"
import { AppReviewDialog } from "@/features/app-review/app-review-dialog"
import { useAuthUser } from "@/features/dashboard/auth-user"
import { useData } from "@/features/dashboard/data-provider"
import { ProfileDialog } from "@/features/dashboard/profile-dialog"
import { venueBase } from "@/features/venue/nav"
import { m } from "@/paraglide/messages"

/**
 * The player's avatar in the blue header — holds everything about the
 * signed-in account (name, email, role, profile, Clerk settings) and sign-out,
 * so the hamburger menu is left for navigation only.
 */
/** Portaled popups escape any page scope — pin them to the white player theme. */
const HEADER_POPUP_CLASS = "player-play-overlay min-w-64"

export function AccountMenu() {
  const { openUserProfile, signOut } = useClerk()
  const sUser = useAuthUser()
  const { user: USER, venues: VENUES } = useData()
  const [profileOpen, setProfileOpen] = React.useState(false)
  const [reviewOpen, setReviewOpen] = React.useState(false)

  const name = sUser.name || USER.name
  const subtitle = sUser.email || USER.handle
  const image = sUser.image || undefined
  const initials = sUser.name ? initialsOf(sUser.name) : USER.initials
  // The player header has no sidebar, so this menu is the only way out of the
  // player workspace — into the admin workspace or one of the venue branches.
  const isAdmin = sUser.role === "admin"
  const hasOtherWorkspace = isAdmin || VENUES.length > 0
  return (
    <>
      <DropdownMenuTrigger>
        <Button
          variant="ghost"
          size="icon"
          aria-label={m.sidebar_profile()}
          className="size-11 rounded-full p-0 hover:bg-transparent focus-visible:ring-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#a5ff12]"
        >
          <Avatar className="size-11 ring-2 ring-white">
            {image ? <AvatarImage src={image} alt={name} /> : null}
            <AvatarFallback className="bg-white text-sm font-bold text-[#2046ed]">
              {initials}
            </AvatarFallback>
          </Avatar>
        </Button>
        <DropdownMenu
          placement="bottom end"
          offset={8}
          className={HEADER_POPUP_CLASS}
        >
          <DropdownMenuGroup>
            <DropdownMenuLabel className="flex items-center gap-3 py-2.5 text-foreground">
              <Avatar className="size-10">
                {image ? <AvatarImage src={image} alt={name} /> : null}
                <AvatarFallback className="bg-[#2046ed] text-xs font-bold text-white">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="grid min-w-0 leading-tight">
                <span className="truncate text-sm font-semibold">{name}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {subtitle}
                </span>
                {sUser.role === "admin" ? (
                  <span className="mt-1 inline-flex w-fit items-center gap-1 rounded-full bg-[#2046ed]/10 px-2 py-0.5 text-[10px] font-semibold text-[#2046ed]">
                    <ShieldCheck className="size-3" />
                    {m.nav_admin()}
                  </span>
                ) : null}
              </div>
            </DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          {hasOtherWorkspace ? (
            <>
              <DropdownMenuGroup>
                <DropdownMenuLabel>{m.sidebar_workspaces()}</DropdownMenuLabel>
                {isAdmin ? (
                  <DropdownMenuItem href="/app/admin">
                    <ShieldCheck />
                    {m.sidebar_admin_workspace()}
                  </DropdownMenuItem>
                ) : null}
                {VENUES.map((v) => (
                  <DropdownMenuItem key={v.id} href={venueBase(v.id)}>
                    <LogoMark />
                    <span className="truncate">{v.name}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
            </>
          ) : null}
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
            onAction={() => void signOut({ redirectUrl: "/" })}
          >
            <LogOut />
            {m.sidebar_logout()}
          </DropdownMenuItem>
        </DropdownMenu>
      </DropdownMenuTrigger>
      <ProfileDialog open={profileOpen} onOpenChange={setProfileOpen} />
      <AppReviewDialog
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        className="player-play-overlay"
      />
    </>
  )
}
