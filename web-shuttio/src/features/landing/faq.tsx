import { ChevronDown } from "lucide-react"
import {
  Button,
  Disclosure,
  DisclosureGroup,
  DisclosurePanel,
  Heading,
} from "react-aria-components"

import { cn } from "@/lib/utils"

export type FaqItem = {
  question: string
  answer: string
}

export function Faq({
  items,
  className,
}: {
  items: FaqItem[]
  className?: string
}) {
  return (
    <DisclosureGroup className={cn("flex flex-col gap-3.5", className)}>
      {items.map((item, i) => (
        <Disclosure
          key={i}
          id={i}
          className="group overflow-hidden rounded-2xl border border-border/80 bg-card/80 shadow-xs backdrop-blur-sm transition-all duration-300 hover:border-primary/40 data-expanded:border-primary/50 data-expanded:bg-card data-expanded:shadow-md"
        >
          <Heading className="m-0">
            <Button
              slot="trigger"
              className="flex w-full cursor-pointer items-center justify-between gap-4 px-6 py-5 text-left text-base font-semibold text-foreground outline-none data-focus-visible:ring-3 data-focus-visible:ring-ring/40 sm:text-lg"
            >
              <div className="flex items-center gap-3.5">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 font-mono text-xs font-bold text-primary transition-colors duration-300 group-data-expanded:bg-lime group-data-expanded:text-lime-foreground">
                  0{i + 1}
                </span>
                <span className="transition-colors duration-300 group-data-expanded:text-primary">
                  {item.question}
                </span>
              </div>
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted/60 transition-colors group-hover:bg-primary/10 group-data-expanded:bg-primary group-data-expanded:text-primary-foreground">
                <ChevronDown
                  className="size-4 text-muted-foreground transition-transform duration-300 group-data-expanded:rotate-180 group-data-expanded:text-primary-foreground"
                  aria-hidden="true"
                />
              </span>
            </Button>
          </Heading>
          <DisclosurePanel className="h-(--disclosure-panel-height) overflow-clip text-muted-foreground transition-[height] duration-300 ease-out motion-reduce:transition-none">
            <div className="border-t border-border/40 px-6 pt-3 pb-5 sm:pl-16">
              <p className="text-[0.95rem] leading-relaxed text-muted-foreground/90">
                {item.answer}
              </p>
            </div>
          </DisclosurePanel>
        </Disclosure>
      ))}
    </DisclosureGroup>
  )
}
