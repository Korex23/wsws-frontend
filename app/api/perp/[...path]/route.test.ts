import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// The proxy is the only gate between the browser and the perp service: it
// holds the allowlist, and it is what ties a trade or an address-scoped read
// to the wallet the session owns.

vi.mock("server-only", () => ({}));

const { verifyRequest, getRequestUser, getRequestIdentity, wsapiPerpRequest } = vi.hoisted(() => ({
  verifyRequest: vi.fn(),
  getRequestUser: vi.fn(),
  getRequestIdentity: vi.fn(),
  wsapiPerpRequest: vi.fn(),
}));
vi.mock("@/lib/server/auth", () => ({ verifyRequest, getRequestUser, getRequestIdentity }));
vi.mock("@/lib/server/chess-identity", () => ({
  walletOfUser: (user: { wallet?: string } | null) => user?.wallet ?? null,
}));
vi.mock("@/lib/server/wsapi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/wsapi")>()),
  wsapiPerpRequest,
}));

import { GET, POST } from "./route";

const WALLET = "0x1111111111111111111111111111111111111111";
const OTHER = "0x2222222222222222222222222222222222222222";

const ctx = (path: string) => ({ params: Promise.resolve({ path: path.split("/") }) });
const get = (path: string) => new NextRequest(`http://app.test/api/perp/${path}`);
const post = (path: string, body: unknown) =>
  new NextRequest(`http://app.test/api/perp/${path}`, {
    method: "POST",
    headers: {
      authorization: "Bearer t",
      "content-type": "application/json",
      "x-forwarded-for": "203.0.113.7, 10.0.0.1",
    },
    body: JSON.stringify(body),
  });

function upstreamAnswer(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

beforeEach(() => {
  verifyRequest.mockReset().mockResolvedValue({ userId: "did:x" });
  getRequestUser.mockReset().mockResolvedValue({ wallet: WALLET });
  getRequestIdentity
    .mockReset()
    .mockResolvedValue({ userId: "did:x", evmAddress: WALLET, solanaAddress: null });
  wsapiPerpRequest.mockReset().mockResolvedValue(upstreamAnswer({ success: true, data: [] }));
});

describe("the allowlist", () => {
  it("answers a path the perp surface does not offer with the gateway's 404 envelope", async () => {
    const res = await GET(get("admin/users"), ctx("admin/users"));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      success: false,
      error: { code: "NOT_FOUND", message: "Not found" },
    });
    expect(wsapiPerpRequest).not.toHaveBeenCalled();
  });

  it("refuses a traversal even when it would normalize onto an allowed path", async () => {
    const res = await GET(get("ark/assets/../prices"), ctx("ark/assets/../prices"));
    expect(res.status).toBe(404);
    expect(wsapiPerpRequest).not.toHaveBeenCalled();
  });
});

describe("public market reads", () => {
  it("forwards the asset list with its shared cache window and no client address", async () => {
    wsapiPerpRequest.mockResolvedValue(
      upstreamAnswer({ success: true, data: [{ symbol: "BTC" }] })
    );
    const res = await GET(get("ark/assets"), ctx("ark/assets"));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, data: [{ symbol: "BTC" }] });
    expect(wsapiPerpRequest).toHaveBeenCalledWith(
      "ark/assets",
      expect.objectContaining({ method: "GET", revalidate: 300, clientIp: undefined })
    );
    expect(verifyRequest).not.toHaveBeenCalled();
  });

  it("passes the upstream status through", async () => {
    wsapiPerpRequest.mockResolvedValue(
      upstreamAnswer({ success: false, error: { code: "RATE_LIMITED" } }, 429)
    );
    const res = await GET(get("ark/prices"), ctx("ark/prices"));
    expect(res.status).toBe(429);
  });

  it("says the service is unreachable when the gateway cannot be reached", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    wsapiPerpRequest.mockRejectedValue(new Error("ECONNREFUSED"));
    const res = await GET(get("ark/prices"), ctx("ark/prices"));
    expect(res.status).toBe(502);
    expect((await res.json()).error.code).toBe("SERVICE_UNAVAILABLE");
    spy.mockRestore();
  });
});

describe("address-scoped reads", () => {
  it("serves the session's own margin state", async () => {
    const path = `ark/account-state/${WALLET}`;
    const res = await GET(get(path), ctx(path));
    expect(res.status).toBe(200);
    expect(wsapiPerpRequest).toHaveBeenCalledWith(path, expect.anything());
  });

  it("hides another wallet's state behind the same 404 as an unknown path", async () => {
    const path = `ark/account-state/${OTHER}`;
    const res = await GET(get(path), ctx(path));
    expect(res.status).toBe(404);
    expect(wsapiPerpRequest).not.toHaveBeenCalled();
  });

  it("hides a deposit address from a request with no session", async () => {
    verifyRequest.mockResolvedValue(null);
    const path = `funding/deposit-address/${WALLET}`;
    const res = await GET(get(path), ctx(path));
    expect(res.status).toBe(404);
    expect(wsapiPerpRequest).not.toHaveBeenCalled();
  });
});

describe("trading writes", () => {
  it("asks for a sign-in before preparing anything", async () => {
    verifyRequest.mockResolvedValue(null);
    const res = await POST(
      post("ark/orders/prepare", { walletId: "w1" }),
      ctx("ark/orders/prepare")
    );
    expect(res.status).toBe(401);
    expect(wsapiPerpRequest).not.toHaveBeenCalled();
  });

  it("refuses a body that trades for a wallet the session does not own", async () => {
    const res = await POST(
      post("ark/orders/prepare", { trader: OTHER }),
      ctx("ark/orders/prepare")
    );
    expect(res.status).toBe(403);
    expect(wsapiPerpRequest).not.toHaveBeenCalled();
  });

  it("forwards the session's own action with the caller's address for rate limiting", async () => {
    const body = { trader: WALLET.toUpperCase().replace("0X", "0x"), size: "1" };
    const res = await POST(post("ark/orders/prepare", body), ctx("ark/orders/prepare"));
    expect(res.status).toBe(200);
    expect(wsapiPerpRequest).toHaveBeenCalledWith(
      "ark/orders/prepare",
      expect.objectContaining({
        method: "POST",
        body,
        clientIp: "203.0.113.7",
        revalidate: undefined,
      })
    );
  });
});
