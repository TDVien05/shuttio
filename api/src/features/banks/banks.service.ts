import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common"

import type { BankInfo } from "../../shared/index.js"

/** Token for the `fetch` implementation (tests swap in a fake). */
export const BANKS_FETCH = Symbol("BANKS_FETCH")
export type BanksFetch = (
  url: string,
  init?: {
    signal?: AbortSignal
    method?: string
    body?: string
    headers?: Record<string, string>
  }
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>

const BANKS_URL = "https://api.vietqr.io/v2/banks"
const LOOKUP_URL = "https://api.vietqr.io/v2/lookup"
/** The bank list changes rarely — refetch at most once a day. */
const TTL_MS = 24 * 60 * 60 * 1000
const TIMEOUT_MS = 8000

interface VietQrBank {
  name?: string
  code?: string
  bin?: string
  shortName?: string
  logo?: string
  transferSupported?: number
}

interface VietQrLookupResponse {
  code?: string
  desc?: string
  data?: { accountName?: string; accountNumber?: string }
}

/**
 * The banks a VietQR transfer can target, from VietQR's public list. Cached in
 * memory; if the upstream is down the last good copy is served instead.
 */
@Injectable()
export class BanksService {
  private readonly logger = new Logger(BanksService.name)
  private cache: { at: number; banks: BankInfo[] } | null = null

  constructor(@Inject(BANKS_FETCH) private readonly fetcher: BanksFetch) {}

  async list(now: number = Date.now()): Promise<BankInfo[]> {
    if (this.cache && now - this.cache.at < TTL_MS) return this.cache.banks
    try {
      const banks = await this.fetchBanks()
      this.cache = { at: now, banks }
      return banks
    } catch (err) {
      if (this.cache) {
        this.logger.warn(
          `Bank list refresh failed, serving cache: ${String(err)}`
        )
        return this.cache.banks
      }
      this.logger.error(`Bank list unavailable: ${String(err)}`)
      throw new ServiceUnavailableException(
        "Chưa tải được danh sách ngân hàng — vui lòng thử lại sau"
      )
    }
  }

  /** One bank by its NAPAS bin, or undefined when it isn't on the list. */
  async find(bin: string): Promise<BankInfo | undefined> {
    return (await this.list()).find((bank) => bank.bin === bin)
  }

  /**
   * Look up the account holder name for a given bank (by NAPAS bin) and account
   * number via VietQR's lookup API. Throws `BadRequestException` when VietQR
   * doesn't find the account; throws `ServiceUnavailableException` on network
   * or credential issues so callers can surface a user-friendly message.
   */
  async lookup(bin: string, accountNumber: string): Promise<string> {
    const clientId = process.env.VIETQR_CLIENT_ID ?? ""
    const apiKey = process.env.VIETQR_API_KEY ?? ""
    let res: Awaited<ReturnType<BanksFetch>>
    try {
      res = await this.fetcher(LOOKUP_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-client-id": clientId,
          "x-api-key": apiKey,
        },
        body: JSON.stringify({ bin, accountNumber }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
    } catch (err) {
      this.logger.warn(`VietQR lookup network error: ${String(err)}`)
      throw new ServiceUnavailableException(
        "Không thể tra cứu tên tài khoản — vui lòng thử lại"
      )
    }
    const body = (await res.json()) as VietQrLookupResponse
    if (!res.ok || body.code !== "00" || !body.data?.accountName) {
      throw new BadRequestException(
        "Không tìm được tên tài khoản — kiểm tra lại số tài khoản và ngân hàng"
      )
    }
    return body.data.accountName
  }

  private async fetchBanks(): Promise<BankInfo[]> {
    const res = await this.fetcher(BANKS_URL, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) throw new Error(`VietQR banks responded ${res.status}`)
    const body = (await res.json()) as { data?: VietQrBank[] }
    const rows = Array.isArray(body.data) ? body.data : []
    const banks: BankInfo[] = []
    for (const b of rows) {
      if (b.transferSupported !== 1 || !b.bin || !b.code || !b.shortName)
        continue
      banks.push({
        bin: b.bin,
        code: b.code,
        shortName: b.shortName,
        name: b.name ?? b.shortName,
        logo: b.logo ?? "",
      })
    }
    return banks
  }
}
