import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  hashEmail,
  lookupLegacyEmail,
  parseLegacyDirectory,
  resetLegacyDirectory,
} from "@/lib/server/legacy-directory";

const EMAIL = "Korex@Example.com";
const HASH = hashEmail(EMAIL);

beforeEach(() => {
  resetLegacyDirectory();
  vi.unstubAllEnvs();
});
afterEach(() => vi.unstubAllGlobals());

describe("parseLegacyDirectory", () => {
  it("survives a hand-exported sheet", () => {
    const rows = parseLegacyDirectory(
      [
        "sha256_email,evm,solana", // header
        "",
        `  "${HASH}" , "0xabc" , "SoL1" `, // quoted and padded
        "not-a-hash,0xdef,SoL2", // junk row
      ].join("\n")
    );
    expect(rows.size).toBe(1);
    expect(rows.get(HASH)).toEqual({ evm: "0xabc", solana: "SoL1" });
  });

  it("keeps a row that has only one chain", () => {
    expect(parseLegacyDirectory(`${HASH},0xabc,`).get(HASH)).toEqual({
      evm: "0xabc",
      solana: null,
    });
  });
});

describe("lookupLegacyEmail", () => {
  const serve = (csv: string, ok = true) =>
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(csv, { status: ok ? 200 : 500 }))
    );

  it("finds a member, case-insensitively", async () => {
    vi.stubEnv("LEGACY_DIRECTORY_URL", "https://sheet.example/csv");
    serve(`${HASH},0xabc,SoL1`);

    await expect(lookupLegacyEmail("korex@example.com")).resolves.toEqual({
      known: true,
      entry: { evm: "0xabc", solana: "SoL1" },
    });
  });

  it("says no for an address the export does not carry", async () => {
    vi.stubEnv("LEGACY_DIRECTORY_URL", "https://sheet.example/csv");
    serve(`${HASH},0xabc,SoL1`);

    await expect(lookupLegacyEmail("someone@else.com")).resolves.toEqual({
      known: false,
      entry: null,
    });
  });

  // The distinction the whole design rests on: unreadable is not empty.
  it("answers unknown, not no, when the sheet cannot be read", async () => {
    vi.stubEnv("LEGACY_DIRECTORY_URL", "https://sheet.example/csv");
    serve("", false);

    await expect(lookupLegacyEmail("korex@example.com")).resolves.toEqual({
      known: null,
      entry: null,
    });
  });

  it("answers unknown when there is no source at all", async () => {
    // No URL, and the bundled file does not exist in the test tree.
    await expect(lookupLegacyEmail("korex@example.com")).resolves.toEqual({
      known: null,
      entry: null,
    });
  });

  it("reads the sheet once, not once per lookup", async () => {
    vi.stubEnv("LEGACY_DIRECTORY_URL", "https://sheet.example/csv");
    const fetchMock = vi.fn(async () => new Response(`${HASH},0xabc,SoL1`, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await lookupLegacyEmail("korex@example.com");
    await lookupLegacyEmail("another@example.com");
    await lookupLegacyEmail("third@example.com");

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("never sends the address anywhere — only its hash is matched", async () => {
    vi.stubEnv("LEGACY_DIRECTORY_URL", "https://sheet.example/csv");
    const fetchMock = vi.fn(async () => new Response(`${HASH},0xabc,SoL1`, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await lookupLegacyEmail(EMAIL);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit | undefined];
    expect(url).not.toContain("korex");
    expect(JSON.stringify(init ?? {})).not.toContain("korex");
  });
});

describe("refreshing on a one-minute window", () => {
  const csv = (hash: string) => `${hash},0xabc,SoL1`;

  beforeEach(() => vi.stubEnv("LEGACY_DIRECTORY_URL", "https://sheet.example/csv"));
  afterEach(() => vi.useRealTimers());

  it("serves the copy it has while the stale one is refetched", async () => {
    vi.useFakeTimers();
    const other = hashEmail("added@later.com");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(csv(HASH), { status: 200 }))
      .mockResolvedValueOnce(new Response(`${csv(HASH)}\n${csv(other)}`, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await lookupLegacyEmail(EMAIL);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Inside the window: no second read.
    vi.setSystemTime(Date.now() + 30_000);
    await lookupLegacyEmail(EMAIL);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Past it: the answer still comes from the copy in hand — the request does
    // not wait on the sheet — and a refresh is kicked off behind it.
    vi.setSystemTime(Date.now() + 61_000);
    await expect(lookupLegacyEmail("added@later.com")).resolves.toEqual({
      known: false,
      entry: null,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Once that lands, the new row is there.
    await vi.waitFor(async () => {
      const found = await lookupLegacyEmail("added@later.com");
      expect(found.known).toBe(true);
    });
  });

  it("keeps the last good copy when a refresh fails", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(csv(HASH), { status: 200 }))
      .mockResolvedValueOnce(new Response("", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    await lookupLegacyEmail(EMAIL);
    vi.setSystemTime(Date.now() + 61_000);
    await lookupLegacyEmail(EMAIL);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    // A blip must not turn a known member into an unknown.
    await expect(lookupLegacyEmail(EMAIL)).resolves.toEqual({
      known: true,
      entry: { evm: "0xabc", solana: "SoL1" },
    });
  });
});

describe("tuning the window without a deploy", () => {
  beforeEach(() => vi.stubEnv("LEGACY_DIRECTORY_URL", "https://sheet.example/csv"));

  it("re-reads on every search when the window is zero", async () => {
    vi.stubEnv("LEGACY_DIRECTORY_TTL_MS", "0");
    const fetchMock = vi.fn(async () => new Response(`${HASH},0xabc,SoL1`, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await lookupLegacyEmail(EMAIL);
    await lookupLegacyEmail(EMAIL);
    await lookupLegacyEmail(EMAIL);

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("falls back to the default when the value is nonsense", async () => {
    vi.stubEnv("LEGACY_DIRECTORY_TTL_MS", "not-a-number");
    const fetchMock = vi.fn(async () => new Response(`${HASH},0xabc,SoL1`, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await lookupLegacyEmail(EMAIL);
    await lookupLegacyEmail(EMAIL);

    // Reused, not refetched — a typo in an env var must not turn every lookup
    // into a download.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
