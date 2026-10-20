import { api } from "@/lib/api"

/** Save (or update) the signed-in player's contact phone number. */
export async function savePlayerPhone(phone: string): Promise<void> {
  await api("/api/account/phone", { method: "PATCH", body: { phone } })
}
