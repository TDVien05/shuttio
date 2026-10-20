import { m } from "@/paraglide/messages"

/** Route `head` for a page titled "<title> · Shuttio". */
export function pageTitle(title: string) {
  return { meta: [{ title: m.meta_title_template({ title }) }] }
}
