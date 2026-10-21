import { AdvancedImage } from "@cloudinary/react"
import { Link } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  MapPin,
  MessageSquare,
  Sparkles,
  Star,
  Users,
} from "lucide-react"

import { Logo } from "@/components/logo"
import { appReviewQueries } from "@/features/app-review/api/app-review.queries"
import { rich } from "@/lib/i18n"
import { CLOUDINARY_IMAGES, cloudinaryImage } from "@/lib/cloudinary"
import { cn } from "@/lib/utils"
import { Faq } from "@/features/landing/components/faq"
import { Pricing } from "@/features/landing/components/pricing"
import { CountUp } from "@/features/landing/components/scroll/count-up"
import { SiteHeader } from "@/features/landing/components/site-header"
import styles from "@/features/landing/components/landing.module.css"
import { m } from "@/paraglide/messages"

const FAQ = [
  { question: m.landing_faq_0_question, answer: m.landing_faq_0_answer },
  { question: m.landing_faq_1_question, answer: m.landing_faq_1_answer },
  { question: m.landing_faq_2_question, answer: m.landing_faq_2_answer },
  { question: m.landing_faq_3_question, answer: m.landing_faq_3_answer },
  { question: m.landing_faq_4_question, answer: m.landing_faq_4_answer },
]

// What Shuttio actually does, scrolled in the marquee under the hero — real
// features, not invented partner clubs.
const HIGHLIGHTS = [
  m.landing_trust_highlights_1,
  m.landing_trust_highlights_2,
  m.landing_trust_highlights_3,
  m.landing_trust_highlights_4,
  m.landing_trust_highlights_5,
  m.landing_trust_highlights_6,
]

const PLAYER_FEATURES = [
  {
    Icon: CalendarDays,
    title: m.landing_player_features_0_title,
    body: m.landing_player_features_0_body,
  },
  {
    Icon: Users,
    title: m.landing_player_features_1_title,
    body: m.landing_player_features_1_body,
  },
  {
    Icon: MapPin,
    title: m.landing_player_features_2_title,
    body: m.landing_player_features_2_body,
  },
  {
    Icon: Sparkles,
    title: m.landing_player_features_3_title,
    body: m.landing_player_features_3_body,
  },
  {
    Icon: MessageSquare,
    title: m.landing_player_features_4_title,
    body: m.landing_player_features_4_body,
  },
]

const STEPS = [
  { title: m.landing_steps_0_title, body: m.landing_steps_0_body },
  { title: m.landing_steps_1_title, body: m.landing_steps_1_body },
  { title: m.landing_steps_2_title, body: m.landing_steps_2_body },
]

const STATS = [
  { label: m.landing_stats_0_label, value: m.landing_stats_0_value },
  { label: m.landing_stats_1_label, value: m.landing_stats_1_value },
  { label: m.landing_stats_2_label, value: m.landing_stats_2_value },
]

const VENUE_BENEFITS = [
  {
    title: m.landing_venue_benefits_0_title,
    body: m.landing_venue_benefits_0_body,
  },
  {
    title: m.landing_venue_benefits_1_title,
    body: m.landing_venue_benefits_1_body,
  },
  {
    title: m.landing_venue_benefits_2_title,
    body: m.landing_venue_benefits_2_body,
  },
  {
    title: m.landing_venue_benefits_3_title,
    body: m.landing_venue_benefits_3_body,
  },
]

const REVIEWER_ROLE = {
  player: m.landing_testimonials_section_role_player,
  venue: m.landing_testimonials_section_role_venue,
}

interface Testimonial {
  key: string
  name: string
  initials: string
  rating: number
  quote: string
  caption: string
}
// Landing CTA in the /app player topbar blue, with hover and keyboard-focus styles.
const ctaClassName =
  "inline-flex h-12 cursor-pointer items-center gap-2 rounded-4xl bg-electric px-7 text-base font-medium text-white transition-colors hover:bg-electric/90 focus-visible:ring-3 focus-visible:ring-electric/40 focus-visible:outline-none"

export function LandingPage() {
  const faqItems = FAQ.map((item) => ({
    question: item.question(),
    answer: item.answer(),
  }))

  // Fetched in the browser after the static HTML loads — the prerendered page
  // never waits on the api.
  const { data: reviews, isSuccess } = useQuery(
    appReviewQueries.appReviewsPublic()
  )
  // Only real app reviews — until the first ones arrive the section shows a
  // gentle invitation instead of invented quotes.
  const testimonials: Testimonial[] = (reviews?.featured ?? []).map((r) => ({
    key: r.id,
    name: r.authorName,
    initials: r.initials,
    rating: r.rating,
    quote: r.comment,
    caption: REVIEWER_ROLE[r.role](),
  }))

  return (
    <div className={styles.landing}>
      <SiteHeader className={styles.header} />
      <main id="top" className={styles.main}>
        <section className={styles.hero}>
          <div className={styles.heroCopy}>
            <h1>
              {m.landing_hero_title_line1()}
              <br />
              {rich(m.landing_hero_title_line2(), {
                accent: (chunks) => <span>{chunks}</span>,
              })}
            </h1>
            <p className={styles.subtitle}>{m.landing_hero_subtitle()}</p>
          </div>
          <div className={styles.heroImage}>
            <AdvancedImage
              cldImg={cloudinaryImage(CLOUDINARY_IMAGES.landingHero)}
              alt={m.landing_hero_image_alt()}
              width={1440}
              height={2560}
              fetchPriority="high"
            />
          </div>
        </section>

        <section className={styles.trust}>
          <div className={styles.trustIntro}>
            <h2>{m.landing_trust_caption()}</h2>
            <p>
              <ArrowUpRight aria-hidden="true" />
              {m.landing_hero_social_proof()}
            </p>
          </div>
          <div
            className={styles.clubMarquee}
            aria-label={m.landing_trust_clubs_aria()}
          >
            <div className={styles.clubTrack}>
              {[0, 1].map((copy) => (
                <div
                  key={copy}
                  className={styles.clubList}
                  aria-hidden={copy === 1 ? "true" : undefined}
                >
                  {HIGHLIGHTS.map((highlight, i) => (
                    <span key={`${copy}-${i}`} className={styles.club}>
                      {highlight()}
                    </span>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </section>

        <div className={styles.lightPanel}>
          <section id="about" className={styles.about}>
            <div className={styles.aboutPhotoLeft}>
              <AdvancedImage
                cldImg={cloudinaryImage(CLOUDINARY_IMAGES.aboutLeft)}
                alt={m.landing_about_section_left_image_alt()}
                loading="lazy"
                className="absolute inset-0 size-full object-cover"
              />
            </div>
            <div className={styles.aboutCopy}>
              <h2>
                {rich(m.landing_about_section_title_strong(), {
                  accent: (chunks) => <span>{chunks}</span>,
                })}
              </h2>
              <p>{m.landing_about_section_body()}</p>
              <Link to="/sign-up" className={ctaClassName}>
                {m.landing_hero_cta()}
                <ArrowRight className="size-4" />
              </Link>
            </div>
            <div className={styles.aboutPhotoRight}>
              <AdvancedImage
                cldImg={cloudinaryImage(CLOUDINARY_IMAGES.aboutRight)}
                alt={m.landing_about_section_right_image_alt()}
                loading="lazy"
                className="absolute inset-0 size-full object-cover object-right"
              />
            </div>
          </section>

          <section id="features" className={styles.features}>
            <div className={styles.featuresCard}>
              <div className={styles.sectionHeading}>
                <h2>{m.landing_player_features_section_title()}</h2>
                <p>{m.landing_player_features_section_subtitle()}</p>
              </div>
              <div className={styles.featureGrid}>
                {PLAYER_FEATURES.map(({ Icon, title, body }, i) => (
                  <article key={i} className={styles.feature}>
                    <Icon aria-hidden="true" />
                    <h3>{title()}</h3>
                    <p>{body()}</p>
                  </article>
                ))}
              </div>
            </div>
          </section>

          <section id="how-it-works" className={styles.steps}>
            <div className={styles.sectionHeading}>
              <h2>{m.landing_steps_section_title()}</h2>
            </div>
            <ol className={styles.stepGrid}>
              {STEPS.map((step, i) => (
                <li key={i}>
                  <span className={styles.stepNumber}>0{i + 1}</span>
                  <h3>{step.title()}</h3>
                  <p>{step.body()}</p>
                </li>
              ))}
            </ol>
            <a href="#features" className={styles.stepsCta}>
              {m.landing_steps_section_cta()}
              <ArrowRight className="size-4" />
            </a>
          </section>
        </div>

        {/* From the stats band down, the landing stays black in both themes;
            `dark` also flips the shadcn tokens used by pricing/FAQ. */}
        <div className={`${styles.darkZone} dark`}>
          <section className={styles.stats}>
            <p className={`${styles.eyebrow} ${styles.statsTitle}`}>
              {m.landing_stats_section_title()}
            </p>
            <dl>
              {STATS.map((stat, i) => (
                <div key={i}>
                  <dt>{stat.label()}</dt>
                  <dd>
                    <CountUp value={stat.value()} />
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          <section className={styles.testimonials}>
            <div className={styles.sectionHeading}>
              <h2>{m.landing_testimonials_section_title()}</h2>
              {reviews?.count ? (
                <p className={styles.ratingSummary}>
                  <Star className="size-4 fill-current" aria-hidden="true" />
                  {m.landing_testimonials_section_summary({
                    average: reviews.average.toFixed(1),
                    count: reviews.count,
                  })}
                </p>
              ) : null}
            </div>
            {isSuccess && testimonials.length === 0 ? (
              <div className={styles.testimonialsEmpty}>
                <p>{m.landing_testimonials_section_empty()}</p>
                <Link to="/sign-up" className={ctaClassName}>
                  {m.landing_testimonials_section_empty_cta()}
                  <ArrowRight className="size-4" />
                </Link>
              </div>
            ) : null}
            <div className={styles.quoteGrid}>
              {testimonials.map((item) => (
                <figure key={item.key}>
                  <div
                    role="img"
                    className={styles.stars}
                    aria-label={m.landing_testimonials_section_rating_aria({
                      rating: item.rating,
                    })}
                  >
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star
                        key={star}
                        className={cn(
                          "size-4 fill-current",
                          star > item.rating && styles.starOff
                        )}
                        aria-hidden="true"
                      />
                    ))}
                  </div>
                  <blockquote>“{item.quote}”</blockquote>
                  <figcaption>
                    <span className={styles.avatar}>{item.initials}</span>
                    <div>
                      <strong>{item.name}</strong>
                      <p>{item.caption}</p>
                    </div>
                  </figcaption>
                </figure>
              ))}
            </div>
          </section>

          <section id="venues" className={styles.venues}>
            <div>
              <p className={styles.eyebrow}>
                {m.landing_venues_section_eyebrow()}
              </p>
              <h2>
                {m.landing_venues_section_title_line1()}
                <br />
                <span>{m.landing_venues_section_title_line2()}</span>
              </h2>
              <p>{m.landing_venues_section_subtitle()}</p>
            </div>
            <div className={styles.venueBenefits}>
              {VENUE_BENEFITS.map((benefit, i) => (
                <article key={i}>
                  <ArrowUpRight aria-hidden="true" />
                  <h3>{benefit.title()}</h3>
                  <p>{benefit.body()}</p>
                </article>
              ))}
            </div>
          </section>

          <section id="pricing" className={styles.pricing}>
            <div className={styles.sectionHeading}>
              <p className={styles.eyebrow}>
                {m.landing_pricing_section_eyebrow()}
              </p>
              <h2>{m.landing_pricing_section_title()}</h2>
              <p>{m.landing_pricing_section_subtitle()}</p>
            </div>
            <Pricing />
          </section>

          <section id="faq" className={styles.faq}>
            <div className={styles.sectionHeading}>
              <p className={styles.eyebrow}>
                {m.landing_faq_section_eyebrow()}
              </p>
              <h2>{m.landing_faq_section_title()}</h2>
            </div>
            <Faq items={faqItems} />
          </section>

          <section id="get-started" className={styles.finalCta}>
            <p className={styles.eyebrow}>{m.landing_cta_eyebrow()}</p>
            <h2>{m.landing_cta_title()}</h2>
            <p>{m.landing_cta_subtitle()}</p>
            <Link to="/sign-up" className={ctaClassName}>
              {m.landing_hero_cta()}
              <ArrowRight className="size-4" />
            </Link>
          </section>
        </div>
      </main>

      <footer className={`${styles.footer} ${styles.darkZone} dark`}>
        <div className={styles.footerGrid}>
          <div>
            <Logo />
            <p>{m.landing_footer_tagline()}</p>
          </div>
          <FooterColumn
            title={m.landing_footer_product_title()}
            links={[
              { label: m.landing_footer_product_features(), href: "#features" },
              {
                label: m.landing_footer_product_how_it_works(),
                href: "#how-it-works",
              },
              { label: m.landing_footer_product_pricing(), href: "#pricing" },
              { label: m.landing_footer_product_faq(), href: "#faq" },
            ]}
          />
          <FooterColumn
            title={m.landing_footer_venues_title()}
            links={[
              { label: m.landing_footer_venues_overview(), href: "#venues" },
            ]}
          />
          <FooterColumn
            title={m.landing_footer_company_title()}
            links={[
              { label: m.landing_footer_company_about(), href: "#about" },
            ]}
          />
        </div>
        <div className={styles.footerBottom}>
          <p>{m.landing_footer_copyright()}</p>
          <a href="#top">SHUTTIO ↗</a>
        </div>
      </footer>
    </div>
  )
}

function FooterColumn({
  title,
  links,
}: {
  title: string
  links: { label: string; href: string }[]
}) {
  return (
    <div>
      <h3>{title}</h3>
      <ul>
        {links.map((link) => (
          <li key={link.label}>
            <a href={link.href}>{link.label}</a>
          </li>
        ))}
      </ul>
    </div>
  )
}
