import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// The relay is the only thing between the browser and the trade service. The
// contract says every failure envelope carries a requestId that support asks
// for, so the relay's OWN failures (unreachable upstream, a response it could
// not understand) mint one, and an upstream requestId is echoed as a header
// the one transport can read without consuming the body.

vi.mock("server-only", () => ({}));

const fetchMock = vi.hoisted(() => vi.fn());
vi.stubGlobal("fetch", fetchMock);

import { GET } from "./route";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const get = (path: string, headers: Record<string, string> = {}) =>
  new NextRequest(`http://app.test/api/trade/${path}`, { headers });

let errorSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  fetchMock.mockReset();
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => errorSpy.mockRestore());

describe("relay-minted request ids", () => {
  it("mints a requestId when the upstream cannot be reached", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
    const res = await GET(get("swaps/abc/status", { authorization: "Bearer t" }));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error.code).toBe("SERVICE_UNAVAILABLE");
    expect(body.error.requestId).toMatch(UUID);
    expect(res.headers.get("x-request-id")).toBe(body.error.requestId);
  });

  it("mints a requestId when the upstream answer does not match the contract", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: { items: "not a list" } }), {
        status: 200,
      })
    );
    const res = await GET(get("tokens?page=1&limit=1"));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error.code).toBe("BAD_RESPONSE");
    expect(body.error.requestId).toMatch(UUID);
    expect(res.headers.get("x-request-id")).toBe(body.error.requestId);
  });

  it("mints a different id per failure, so two screenshots never share one", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
    const a = await (await GET(get("swaps/a/status"))).json();
    const b = await (await GET(get("swaps/b/status"))).json();
    expect(a.error.requestId).not.toBe(b.error.requestId);
  });
});

describe("upstream request ids", () => {
  it("passes the service's own failure envelope through untouched and echoes its requestId as a header", async () => {
    const upstream = {
      success: false,
      error: {
        code: "NO_SWAP_ROUTE",
        message: "no route",
        details: null,
        requestId: "req-upstream-1",
      },
    };
    fetchMock.mockResolvedValue(new Response(JSON.stringify(upstream), { status: 422 }));
    const res = await GET(get("swaps/abc/status", { authorization: "Bearer t" }));
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual(upstream);
    expect(res.headers.get("x-request-id")).toBe("req-upstream-1");
  });

  it("sets no header when the upstream failure carried no id", async () => {
    fetchMock.mockResolvedValue(new Response("<html>bad gateway</html>", { status: 502 }));
    const res = await GET(get("swaps/abc/status", { authorization: "Bearer t" }));
    expect(res.status).toBe(502);
    expect(res.headers.get("x-request-id")).toBeNull();
  });
});
