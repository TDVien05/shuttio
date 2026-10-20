import { Check } from "lucide-react"

import { cn } from "@/lib/utils"
import { LinkButton } from "@/components/ui/button"
import styles from "@/features/landing/components/landing.module.css"
import { m } from "@/paraglide/messages"

const PLANS = [
  {
    id: "players",
    featured: false,
    name: m.landing_pricing_players_name,
    badge: m.landing_pricing_players_badge,
    tagline: m.landing_pricing_players_tagline,
    price: m.landing_pricing_players_price,
    period: m.landing_pricing_players_period,
    cta: m.landing_pricing_players_cta,
    features: [
      m.landing_pricing_players_features_1,
      m.landing_pricing_players_features_2,
      m.landing_pricing_players_features_3,
      m.landing_pricing_players_features_4,
      m.landing_pricing_players_features_5,
    ],
  },
  {
    id: "venues",
    featured: true,
    name: m.landing_pricing_venues_name,
    badge: m.landing_pricing_venues_badge,
    tagline: m.landing_pricing_venues_tagline,
    price: m.landing_pricing_venues_price,
    period: m.landing_pricing_venues_period,
    cta: m.landing_pricing_venues_cta,
    features: [
      m.landing_pricing_venues_features_1,
      m.landing_pricing_venues_features_2,
      m.landing_pricing_venues_features_3,
      m.landing_pricing_venues_features_4,
      m.landing_pricing_venues_features_5,
    ],
  },
]

function PlanCard({ plan }: { plan: (typeof PLANS)[number] }) {
  const { featured } = plan

  return (
    <div
      className={cn(
        "relative flex h-full flex-col rounded-3xl border p-6 transition-all duration-300 hover:-translate-y-1 sm:p-8",
        featured
          ? "border-lime/50 bg-gradient-to-b from-primary/10 via-card to-lime/10 shadow-xl ring-1 shadow-lime/5 ring-lime/30"
          : "border-border bg-card/80 shadow-sm backdrop-blur-sm hover:border-primary/30 hover:shadow-md",
        featured ? styles.planFeatured : styles.plan
      )}
    >
      {featured && (
        <span className="absolute -top-3.5 left-6 inline-flex items-center gap-1.5 rounded-full bg-lime px-3.5 py-1 text-xs font-bold text-lime-foreground shadow-md shadow-lime/20">
          <span className="size-1.5 animate-pulse rounded-full bg-lime-foreground" />
          {m.landing_pricing_section_badge()}
        </span>
      )}

      <div className="flex items-center justify-between">
        <h3 className="font-heading text-2xl font-bold tracking-tight">
          {plan.name()}
        </h3>
        <span
          className={cn(
            "rounded-full px-2.5 py-0.5 text-xs font-semibold",
            featured
              ? "border border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-lime-300"
              : "bg-muted text-muted-foreground"
          )}
        >
          {plan.badge()}
        </span>
      </div>

      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        {plan.tagline()}
      </p>

      <div className="mt-6 flex items-baseline gap-1.5 border-b border-border/60 pb-6">
        <span
          data-plan-price
          className="font-sans text-4xl font-extrabold tracking-tight text-foreground sm:text-5xl"
        >
          {plan.price()}
        </span>
        <span
          data-plan-period
          className="text-sm font-medium text-muted-foreground"
        >
          {plan.period()}
        </span>
      </div>

      <ul className="mt-6 flex flex-1 flex-col gap-3.5">
        {plan.features.map((feature, i) => (
          <li key={i} className="flex items-start gap-3 text-sm">
            <span
              className={cn(
                "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                featured
                  ? "bg-lime text-lime-foreground"
                  : "bg-primary/10 text-primary"
              )}
            >
              <Check className="size-3 stroke-3" />
            </span>
            <span className="font-medium text-foreground/90">{feature()}</span>
          </li>
        ))}
      </ul>

      <div className="mt-8 text-foreground">
        <LinkButton
          href="/sign-up"
          variant={featured ? "lime" : "outline"}
          size="lg"
          className={cn(
            "w-full cursor-pointer rounded-2xl font-semibold transition-transform duration-200 active:scale-98",
            featured &&
              "bg-electric text-white shadow-lg shadow-electric/20 hover:bg-electric/90"
          )}
        >
          {plan.cta()}
        </LinkButton>
      </div>
    </div>
  )
}

export function Pricing() {
  return (
    <div className="mx-auto grid max-w-4xl items-stretch gap-6 sm:grid-cols-2">
      {PLANS.map((plan) => (
        <PlanCard key={plan.id} plan={plan} />
      ))}
    </div>
  )
}
