import type { Http } from "../mem/providers.js";

const DEVICE_URL = "https://oauth2.googleapis.com/device/code";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
/** The only Drive scope Google allows in the device flow. */
export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";

export interface GoogleClient {
  clientId: string;
  clientSecret: string;
}

export interface StoredTokens {
  refreshToken: string;
  accessToken: string;
  /** Epoch ms. */
  expiresAt: number;
}

export interface DeviceCode {
  deviceCode: string;
  userCode: string;
  verificationUrl: string;
  interval: number;
  expiresIn: number;
}

const form = (o: Record<string, string>) =>
  Object.entries(o).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");

async function post(http: Http, url: string, body: Record<string, string>) {
  const res = await http({
    url,
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form(body),
  });
  let json: any = {};
  try {
    json = JSON.parse(res.text);
  } catch {
    /* non-JSON error body */
  }
  return { status: res.status, json };
}

/** Step 1: ask Google for a code the user types at google.com/device. */
export async function startDeviceLogin(http: Http, c: GoogleClient): Promise<DeviceCode> {
  const { status, json } = await post(http, DEVICE_URL, { client_id: c.clientId, scope: DRIVE_SCOPE });
  if (status !== 200) throw new Error(`Google sign-in failed to start: ${json.error_description ?? json.error ?? status}`);
  return {
    deviceCode: json.device_code,
    userCode: json.user_code,
    verificationUrl: json.verification_url,
    interval: json.interval ?? 5,
    expiresIn: json.expires_in ?? 1800,
  };
}

/**
 * Step 2: poll until the user approves. Returns tokens, or throws if the code
 * expires or access is denied. `sleep` is injectable for tests.
 */
export async function pollDeviceLogin(
  http: Http,
  c: GoogleClient,
  code: DeviceCode,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  now: () => number = Date.now,
): Promise<StoredTokens> {
  let interval = code.interval;
  const deadline = now() + code.expiresIn * 1000;
  while (now() < deadline) {
    await sleep(interval * 1000);
    const { json } = await post(http, TOKEN_URL, {
      client_id: c.clientId,
      client_secret: c.clientSecret,
      device_code: code.deviceCode,
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
    });
    if (json.access_token) {
      return {
        refreshToken: json.refresh_token,
        accessToken: json.access_token,
        expiresAt: now() + (json.expires_in ?? 3600) * 1000,
      };
    }
    if (json.error === "authorization_pending") continue;
    if (json.error === "slow_down") {
      interval += 5;
      continue;
    }
    throw new Error(`Google sign-in failed: ${json.error_description ?? json.error}`);
  }
  throw new Error("Google sign-in timed out — start again.");
}

/** Hands out a valid access token, refreshing it (and persisting) when needed. */
export class GoogleSession {
  constructor(
    private readonly http: Http,
    private readonly client: GoogleClient,
    private tokens: StoredTokens,
    private readonly onChange: (t: StoredTokens) => void | Promise<void> = () => {},
    private readonly now: () => number = Date.now,
  ) {}

  async accessToken(): Promise<string> {
    if (this.now() < this.tokens.expiresAt - 60_000) return this.tokens.accessToken;
    const { status, json } = await post(this.http, TOKEN_URL, {
      client_id: this.client.clientId,
      client_secret: this.client.clientSecret,
      refresh_token: this.tokens.refreshToken,
      grant_type: "refresh_token",
    });
    if (status !== 200 || !json.access_token) {
      throw new Error(`Google session expired — sign in again (${json.error_description ?? json.error ?? status}).`);
    }
    this.tokens = {
      refreshToken: this.tokens.refreshToken,
      accessToken: json.access_token,
      expiresAt: this.now() + (json.expires_in ?? 3600) * 1000,
    };
    await this.onChange(this.tokens);
    return this.tokens.accessToken;
  }
}
