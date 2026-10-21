/** Signed params the api hands out for one direct browser → Cloudinary upload. */
export interface CloudinarySignature {
  cloudName: string
  apiKey: string
  timestamp: number
  folder: string
  allowedFormats: string
  signature: string
}

/** Image types a payment screenshot may be (matches the signature's allowed formats). */
export const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp"
/** Largest screenshot accepted before upload. */
export const IMAGE_MAX_BYTES = 5 * 1024 * 1024

/** Upload one file straight to Cloudinary with an api-made signature; resolves to its HTTPS URL. */
export async function uploadToCloudinary(
  file: File,
  sig: CloudinarySignature
): Promise<string> {
  const form = new FormData()
  form.append("file", file)
  form.append("api_key", sig.apiKey)
  form.append("timestamp", String(sig.timestamp))
  form.append("folder", sig.folder)
  form.append("allowed_formats", sig.allowedFormats)
  form.append("signature", sig.signature)
  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${sig.cloudName}/image/upload`,
    { method: "POST", body: form }
  )
  const body = (await res.json().catch(() => null)) as {
    secure_url?: string
    error?: { message?: string }
  } | null
  if (!res.ok || !body?.secure_url) {
    throw new Error(body?.error?.message ?? "Upload failed")
  }
  return body.secure_url
}

/** A chat picture's signed upload params — private (`authenticated`) delivery. */
export interface PrivateUploadSignature extends CloudinarySignature {
  type: "authenticated"
}

/** What Cloudinary reports about an uploaded asset, as the api needs it. */
export interface UploadedAsset {
  publicId: string
  version: number
  format: string
  width?: number
  height?: number
}

/** Upload one file as a private asset; resolves to its id/version, not a URL. */
export async function uploadPrivateToCloudinary(
  file: File,
  sig: PrivateUploadSignature
): Promise<UploadedAsset> {
  const form = new FormData()
  form.append("file", file)
  form.append("api_key", sig.apiKey)
  form.append("timestamp", String(sig.timestamp))
  form.append("folder", sig.folder)
  form.append("allowed_formats", sig.allowedFormats)
  form.append("type", sig.type)
  form.append("signature", sig.signature)
  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${sig.cloudName}/image/upload`,
    { method: "POST", body: form }
  )
  const body = (await res.json().catch(() => null)) as {
    public_id?: string
    version?: number
    format?: string
    width?: number
    height?: number
    error?: { message?: string }
  } | null
  if (!res.ok || !body?.public_id || !body.version || !body.format) {
    throw new Error(body?.error?.message ?? "Upload failed")
  }
  return {
    publicId: body.public_id,
    version: body.version,
    format: body.format,
    width: body.width,
    height: body.height,
  }
}
