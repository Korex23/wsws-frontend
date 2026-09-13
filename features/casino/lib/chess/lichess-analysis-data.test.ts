import { describe, expect, it } from "vitest";
import { buildLichessAnalysisData } from "./lichess-analysis-data";

const start = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

describe("buildLichessAnalysisData", () => {
  it("builds the complete replay tree and a computer solution branch", () => {
    const data = buildLichessAnalysisData({
      match: {
        id: "game-1",
        state: "settled",
        variant: "standard",
        initialFen: start,
        fen: "rnbqkbnr/pppp1ppp/8/4p3/3P4/8/PPP1PPPP/RNBQKBNR w KQkq e6 0 2",
        timeControl: "5+3",
        clockMode: "real_time",
        turn: "w",
        clocks: { w: 297, b: 298 },
        result: { kind: "resignation", winner: "w", reason: "resignation" },
        rating: {
          rated: true,
          perfKey: "blitz",
          white: { rating: 126, provisional: false, diff: 22 },
          black: { rating: 100, provisional: false, diff: -22 },
        },
        white: { id: "white-id", username: "White", walletAddress: "0x1" },
        black: { id: "black-id", username: "Black", walletAddress: "0x2" },
      },
      moves: [
        {
          ply: 1,
          uci: "d2d4",
          san: "d4",
          fenAfter: "rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1",
          clockMsRemaining: 297000,
        },
        {
          ply: 2,
          uci: "e7e5",
          san: "e5",
          fenAfter: "rnbqkbnr/pppp1ppp/8/4p3/3P4/8/PPP1PPPP/RNBQKBNR w KQkq e6 0 2",
          clockMsRemaining: 298000,
        },
      ],
      analysis: {
        matchId: "game-1",
        depth: 18,
        engineName: "Stockfish 18",
        summaries: [
          {
            side: "white",
            accuracyPercent: 94,
            averageCentipawnLoss: 8,
            bestMoves: 1,
            goodMoves: 0,
            inaccuracies: 0,
            mistakes: 0,
            blunders: 0,
          },
          {
            side: "black",
            accuracyPercent: 18,
            averageCentipawnLoss: 189,
            bestMoves: 0,
            goodMoves: 0,
            inaccuracies: 0,
            mistakes: 0,
            blunders: 1,
          },
        ],
        moves: [
          {
            ply: 1,
            side: "white",
            classification: "best",
            fen: start,
            playedUci: "d2d4",
            playedSan: "d4",
            bestUci: "d2d4",
            bestSan: "d4",
            pv: "d2d4 d7d5",
            cpBefore: 20,
            cpAfter: 30,
            mateBefore: null,
            mateAfter: null,
            coachComment: "Best move.",
          },
          {
            ply: 2,
            side: "black",
            classification: "blunder",
            fen: "rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1",
            playedUci: "e7e5",
            playedSan: "e5",
            bestUci: "d7d5",
            bestSan: "d5",
            pv: "d7d5 c2c4",
            cpBefore: 30,
            cpAfter: 260,
            mateBefore: null,
            mateAfter: null,
            coachComment: "d5 was best.",
          },
        ],
      },
      orientation: "white",
    });

    expect(data.treeParts).toHaveLength(3);
    expect(data.treeParts[0]).toMatchObject({ ply: 0, fen: start });
    expect(data.treeParts[2]).toMatchObject({ ply: 2, uci: "e7e5", san: "e5" });
    expect(data.treeParts[2].glyphs?.[0]).toMatchObject({ id: 4, symbol: "??" });
    expect(data.treeParts[1].children?.[0]).toMatchObject({
      ply: 2,
      uci: "d7d5",
      san: "d5",
      comp: true,
    });
    expect(data.analysis).toMatchObject({
      white: { accuracy: 94, blunder: 0 },
      black: { accuracy: 18, blunder: 1 },
    });
    expect(data.game).toMatchObject({
      turns: 2,
      winner: "white",
      rated: true,
      opening: { eco: "A40", name: "Queen's Pawn Opening", ply: 1 },
    });
  });
});
