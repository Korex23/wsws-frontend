import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { chessLobbySource } from "@/app/(session)/casino/chess/page";
import {
  chessFrameSourceForAppRoute,
  chessLobbyUrlAfterSetupConsumed,
} from "@/features/casino/components/chess-app/chess-lobby-frame";

describe("chessLobbySource", () => {
  it("opens a shared challenge in the authenticated chess frame", () => {
    expect(chessLobbySource({ challenge: "challenge-id" })).toBe(
      "/api/chess/challenge/challenge-id"
    );
  });

  it("keeps the friend setup route", () => {
    expect(chessLobbySource({ setup: "friend" })).toBe("/api/chess/play?setup=friend#game-setup");
  });

  it("keeps the computer and custom-game setup routes", () => {
    expect(chessLobbySource({ setup: "ai" })).toBe("/api/chess/play?setup=ai#game-setup");
    expect(chessLobbySource({ setup: "hook" })).toBe("/api/chess/play?setup=hook#game-setup");
  });

  it("restores the selected lobby tab on a full refresh", () => {
    expect(chessLobbySource({ tab: "lobby" })).toBe("/api/chess/play?tab=lobby");
    expect(chessLobbySource({ tab: "lobby", setup: "hook" })).toBe(
      "/api/chess/play?tab=lobby&setup=hook#game-setup"
    );
  });

  it("consumes setup navigation state after opening the requested modal", () => {
    expect(
      chessLobbyUrlAfterSetupConsumed(
        new URL("http://localhost:3000/casino/chess?setup=friend#game-setup")
      )
    ).toBe("/casino/chess");
    expect(
      chessLobbyUrlAfterSetupConsumed(
        new URL("http://localhost:3000/casino/chess?setup=ai&mode=casual#game-setup")
      )
    ).toBe("/casino/chess?mode=casual");
    expect(
      chessLobbyUrlAfterSetupConsumed(new URL("http://localhost:3000/casino/chess"))
    ).toBeNull();
  });

  it("can close a consumed setup modal without another route transition", () => {
    expect(chessFrameSourceForAppRoute("/casino/chess")).toBe("/api/chess/play");
  });

  it("keeps two activity cards on top and centers Play Bots below", () => {
    const css = readFileSync(resolve("public/chess/lichess/css/lobby.css"), "utf8");

    expect(css).toContain("grid-template-columns: repeat(2, minmax(0, 300px));");
    expect(css).toContain("grid-template-rows: repeat(8, 1fr);");
    expect(css).toContain('grid-template-areas: "side app app table" "about about about about";');
    expect(css).toMatch(
      /\.lobby-activity:nth-child\(3\)\s*\{[^}]*grid-column:\s*1 \/ -1;[^}]*width:\s*min\(300px, calc\(50% - 0\.35rem\)\);[^}]*justify-self:\s*center;/s
    );
  });
});
