import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { v2 as cloudinary } from "cloudinary"

import type {
  ChatImage,
  ChatImageRef,
  ChatImageUploadSignature,
} from "../../shared/index.js"
import {
  VENUE_PHOTO_FORMATS,
  signCloudinaryParams,
} from "../venues/venue-photos.service.js"
import type { ChatMessageImage } from "./chat.schema.js"

/** Cloudinary folder holding one conversation's pictures. */
export const chatImageFolder = (channelId: string) =>
  `shuttio/chat/${channelId}`

/** Picture width of the full view / the in-list thumbnail. */
const FULL_WIDTH = 1280
const THUMB_WIDTH = 480

const PUBLIC_ID = /^[\w-]{1,64}$/

/**
 * Chat pictures. They're uploaded straight from the browser as Cloudinary
 * `authenticated` assets: nothing is reachable without a signed delivery URL,
 * and this service only signs URLs while serving a message to a member.
 */
@Injectable()
export class ChatImagesService {
  private readonly logger = new Logger(ChatImagesService.name)

  constructor(@Inject(ConfigService) private readonly config: ConfigService) {}

  private credentials() {
    const cloudName = this.config.get<string>("CLOUDINARY_CLOUD_NAME")
    const apiKey = this.config.get<string>("CLOUDINARY_API_KEY")
    const apiSecret = this.config.get<string>("CLOUDINARY_API_SECRET")
    if (!cloudName || !apiKey || !apiSecret) {
      throw new ServiceUnavailableException(
        "Chưa cấu hình dịch vụ lưu ảnh (Cloudinary)"
      )
    }
    return { cloudName, apiKey, apiSecret }
  }

  /** A signature for one private upload into the conversation's folder. */
  signUpload(channelId: string): ChatImageUploadSignature {
    const { cloudName, apiKey, apiSecret } = this.credentials()
    const timestamp = Math.floor(Date.now() / 1000)
    const folder = chatImageFolder(channelId)
    const type = "authenticated" as const
    const signature = signCloudinaryParams(
      { allowed_formats: VENUE_PHOTO_FORMATS, folder, timestamp, type },
      apiSecret
    )
    return {
      cloudName,
      apiKey,
      timestamp,
      folder,
      allowedFormats: VENUE_PHOTO_FORMATS,
      type,
      signature,
    }
  }

  /** Throws unless `ref` is an upload into this conversation's own folder. */
  toStored(channelId: string, ref: ChatImageRef): ChatMessageImage {
    const prefix = `${chatImageFolder(channelId)}/`
    const id = ref.publicId.startsWith(prefix)
      ? ref.publicId.slice(prefix.length)
      : null
    if (
      !id ||
      !PUBLIC_ID.test(id) ||
      !VENUE_PHOTO_FORMATS.split(",").includes(ref.format)
    ) {
      throw new BadRequestException("Ảnh không hợp lệ")
    }
    return {
      publicId: ref.publicId,
      version: ref.version,
      format: ref.format,
      ...(ref.width ? { width: ref.width } : {}),
      ...(ref.height ? { height: ref.height } : {}),
    }
  }

  /** The signed, member-only URLs for a stored picture. */
  deliver(image: ChatMessageImage | undefined): ChatImage | undefined {
    if (!image) return undefined
    if (image.url) return { url: image.url, thumbUrl: image.url }
    if (!image.publicId) return undefined
    const { cloudName, apiSecret, apiKey } = this.credentials()
    const sign = (width: number) =>
      cloudinary.url(image.publicId!, {
        cloud_name: cloudName,
        api_key: apiKey,
        api_secret: apiSecret,
        secure: true,
        type: "authenticated",
        sign_url: true,
        version: image.version,
        format: image.format,
        transformation: [{ width, crop: "limit", quality: "auto" }],
      })
    return {
      url: sign(FULL_WIDTH),
      thumbUrl: sign(THUMB_WIDTH),
      ...(image.width ? { width: image.width } : {}),
      ...(image.height ? { height: image.height } : {}),
    }
  }

  /** Best-effort removal of a deleted conversation's pictures. */
  async destroy(publicIds: string[]): Promise<void> {
    if (!publicIds.length) return
    try {
      const { cloudName, apiKey, apiSecret } = this.credentials()
      cloudinary.config({
        cloud_name: cloudName,
        api_key: apiKey,
        api_secret: apiSecret,
      })
      // The Admin API takes 100 ids per call.
      for (let i = 0; i < publicIds.length; i += 100) {
        await cloudinary.api.delete_resources(publicIds.slice(i, i + 100), {
          type: "authenticated",
        })
      }
    } catch (err) {
      this.logger.warn(`Failed to delete chat images: ${String(err)}`)
    }
  }
}
