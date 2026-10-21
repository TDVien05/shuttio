import { Cloudinary } from "@cloudinary/url-gen"
import { format, quality } from "@cloudinary/url-gen/actions/delivery"
import { auto as autoFormat } from "@cloudinary/url-gen/qualifiers/format"
import { auto as autoQuality } from "@cloudinary/url-gen/qualifiers/quality"

import { CLOUDINARY_CLOUD_NAME } from "@/lib/env"

const cld = new Cloudinary({ cloud: { cloudName: CLOUDINARY_CLOUD_NAME } })

/** Static site imagery, by Cloudinary public ID. */
export const CLOUDINARY_IMAGES = {
  landingHero: "landing-page-top_vn1o4p",
  aboutLeft: "left-landing-page_ovtu3f",
  aboutRight: "right-landing-page_yltc3e",
  courtBackdrop: "hero-court_xy86ig",
  courtLines: "court-lines_psiglb",
  playerPurpleHair: "player-purple-hair_qqsmhb",
  playerGreenBuns: "player-green-buns_jvfhv1",
  playerBlueAfro: "player-blue-afro_vlh7cm",
  playerBlueBuns: "player-blue-buns_twnug1",
  playerPinkHair: "player-pink-hair_yle3qg",
  badgeJoinMatch: "badge-join-match_pplkjc",
  badgeRightPeople: "badge-right-people_l1ojun",
  badgeRightCourt: "badge-right-court_bofjre",
  stickerPeaceHand: "sticker-peace-hand_xevd9f",
  stickerPinkAsterisk: "sticker-pink-asterisk_zd4jgj",
} as const

/** Auto format (WebP/AVIF where supported) and auto quality for a public ID. */
export function cloudinaryImage(publicId: string) {
  return cld
    .image(publicId)
    .delivery(format(autoFormat()))
    .delivery(quality(autoQuality()))
}
