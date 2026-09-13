import { ChessLobbyFrame } from "@/features/casino/components/chess-app/chess-lobby-frame";

export default async function ChessInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string | string[] }>;
}) {
  const rawCode = (await searchParams).code;
  const code = Array.isArray(rawCode) ? rawCode[0] : rawCode;
  const source = code
    ? `/api/chess/challenge/funded/${encodeURIComponent(code)}`
    : "/api/chess/play?setup=friend#game-setup";
  return <ChessLobbyFrame source={source} />;
}
