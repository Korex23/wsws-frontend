import { NextResponse, type NextRequest } from "next/server";
import { verifyRequest } from "@/lib/server/auth";
import { forwardMigration, migrationServiceEnabled, unauthorized } from "@/lib/server/migration";

// What the service knows about the signed-in account's old wallet. With the
// flag off, or for an account the service has never heard of, the answer is
// the empty status: not linked, nothing known. The client treats both the
// same, so shipping the frontend ahead of the service changes nothing.
const EMPTY_STATUS = {
  linked: false,
  legacy: null,
  hasLegacyFunds: false,
  legacyFundsUsd: 0,
  pendingOnramps: [],
  rekey: {},
};

function empty() {
  return NextResponse.json({ success: true, data: EMPTY_STATUS });
}

export async function GET(req: NextRequest) {
  const claims = await verifyRequest(req);
  if (!claims) return unauthorized();
  if (!migrationServiceEnabled()) return empty();
  const res = await forwardMigration("/status", {
    method: "GET",
    headers: { authorization: req.headers.get("authorization") ?? "" },
  });
  return res.status === 404 ? empty() : res;
}
