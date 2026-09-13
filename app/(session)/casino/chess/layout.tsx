import { headers } from "next/headers";
import { ChessHeaderActions } from "@/features/casino/components/chess-app/chess-profile-balance";
import { ChessStyleBoundary } from "@/features/casino/components/chess-app/chess-style-boundary";

export default async function ChessLayout({ children }: { children: React.ReactNode }) {
  const requestHeaders = await headers();
  const embedded = requestHeaders.get("sec-fetch-dest") === "iframe";

  return (
    <>
      <ChessStyleBoundary />
      {children}
      {embedded ? null : <ChessHeaderActions />}
    </>
  );
}
