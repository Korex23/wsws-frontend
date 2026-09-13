import type { ReactNode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
}));
const fundedFriend = vi.hoisted(() => ({
  create: vi.fn(),
  accept: vi.fn(),
}));
const auth = vi.hoisted(() => ({
  logout: vi.fn(() => Promise.resolve()),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => navigation,
}));

vi.mock("@privy-io/react-auth", () => ({
  getAccessToken: vi.fn(() => Promise.resolve("access-token")),
  getIdentityToken: vi.fn(() => Promise.resolve("identity-token")),
  usePrivy: () => auth,
}));

vi.mock("@/components/auth/auth-guard", () => ({
  AuthGuard: ({ children }: { children: ReactNode }) => children,
}));

vi.mock("@/features/casino/components/chess-app/chess-profile-balance", () => ({
  ChessProfileBalance: () => <output>Profile balance</output>,
}));

vi.mock("@/features/casino/hooks/use-funded-chess-computer", () => ({
  useFundedChessComputer: () => ({
    start: vi.fn(),
    availableUsdc: "0",
    balanceLoading: false,
  }),
}));

vi.mock("@/features/casino/hooks/use-funded-chess-challenge", () => ({
  friendTimeControl: (value: string) => {
    const [seconds, increment] = value.split("+");
    return `${Number(seconds) / 60}+${increment}`;
  },
  useFundedChessChallenge: () => ({
    create: fundedFriend.create,
    accept: fundedFriend.accept,
    availableUsdc: "25",
    balanceLoading: false,
    configured: true,
  }),
}));

import {
  ChessLobbyFrame,
  chessAppRouteForUrl,
  chessFrameSourceForAppRoute,
  chessParentRouteForFrameUrl,
  rewriteChessFrameLinks,
} from "@/features/casino/components/chess-app/chess-lobby-frame";

describe("ChessLobbyFrame", () => {
  beforeEach(() => {
    navigation.push.mockClear();
    navigation.replace.mockClear();
    fundedFriend.create.mockReset();
    fundedFriend.accept.mockReset();
    auth.logout.mockClear();
  });

  it("loads the Lichess page through the application's shared auth guard", () => {
    render(<ChessLobbyFrame source="/api/chess/play" />);

    expect(screen.getByTitle("Ark Chess")).toHaveAttribute("src", "/api/chess/play");
  });

  it("does not let a stale iframe load replace the parent setup route", () => {
    render(<ChessLobbyFrame source="/api/chess/play?setup=ai#game-setup" />);

    screen.getByTitle("Ark Chess").dispatchEvent(new Event("load"));

    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it("clears an expired session and opens the shared login page", async () => {
    render(<ChessLobbyFrame source="/api/chess/play" />);

    const frame = screen.getByTitle<HTMLIFrameElement>("Ark Chess");
    const frameDocument = frame.contentDocument!;
    frameDocument.open();
    frameDocument.write(
      '<body>{"success":false,"error":{"code":"UNAUTHORIZED","message":"Sign in to play."}}</body>'
    );
    frameDocument.close();
    fireEvent.load(frame);

    expect(frame).toHaveClass("opacity-0");
    await waitFor(() => {
      expect(auth.logout).toHaveBeenCalledOnce();
      expect(navigation.replace).toHaveBeenCalledWith("/auth");
    });
  });

  it("gives backend navigation a canonical top-level fallback", () => {
    const frameDocument = document.implementation.createHTMLDocument("Ark Chess");
    frameDocument.body.innerHTML = `
      <a href="http://localhost:3000/api/chess/learn/puzzles" target="_top">Puzzles</a>
      <form action="/api/chess/play/seeks" target="_top"></form>
      <form action="/api/chess/challenge" data-friend-setup></form>
      <button formtarget="_top">Submit</button>
    `;

    rewriteChessFrameLinks(frameDocument, "http://localhost:3000");

    const link = frameDocument.querySelector("a");
    expect(link?.getAttribute("href")).toBe("/casino/chess/puzzles");
    expect(link?.dataset.arkRoute).toBe("/casino/chess/puzzles");
    expect(link?.getAttribute("target")).toBe("_top");
    expect(
      frameDocument.querySelector('form[action="/api/chess/play/seeks"]')?.getAttribute("target")
    ).toBe("_top");
    expect(frameDocument.querySelector("form[data-friend-setup]")?.getAttribute("target")).toBe(
      "_top"
    );
    expect(frameDocument.querySelector("button")?.getAttribute("formtarget")).toBe("_top");
  });

  it("opens the lobby puzzle card on the parent puzzle route", () => {
    render(<ChessLobbyFrame source="/api/chess/play" />);

    const frame = screen.getByTitle<HTMLIFrameElement>("Ark Chess");
    const frameDocument = frame.contentDocument!;
    frameDocument.open();
    frameDocument.write(
      '<body><a href="/api/chess/learn/puzzles" target="_top">Solve Puzzles</a></body>'
    );
    frameDocument.close();
    fireEvent.load(frame);

    const puzzleLink = frameDocument.querySelector<HTMLAnchorElement>("a")!;
    expect(puzzleLink.getAttribute("href")).toBe("/casino/chess/puzzles");
    expect(puzzleLink.getAttribute("target")).toBe("_top");

    fireEvent.click(puzzleLink);

    expect(navigation.push).toHaveBeenCalledWith("/casino/chess/puzzles");
  });

  it("routes Back to Arkade through the parent router on the first click", () => {
    expect(
      chessAppRouteForUrl(
        new URL("http://localhost:3000/casino"),
        "back to arkade",
        "http://localhost:3000"
      )
    ).toBe("/casino");

    render(<ChessLobbyFrame source="/api/chess/play" />);
    const frame = screen.getByTitle<HTMLIFrameElement>("Ark Chess");
    const frameDocument = frame.contentDocument;
    frameDocument!.open();
    frameDocument!.write('<body><a href="/casino" target="_top">Back to Arkade</a></body>');
    frameDocument!.close();
    fireEvent.load(frame);
    fireEvent.click(frameDocument!.querySelector("a")!);

    expect(navigation.push).toHaveBeenCalledWith("/casino");
  });

  it("preserves lobby setup navigation when leaving the embedded page", () => {
    for (const setup of ["ai", "friend", "hook"]) {
      const backendRoute = chessAppRouteForUrl(
        new URL(`http://localhost:3000/api/chess/play?setup=${setup}#game-setup`),
        "",
        "http://localhost:3000"
      );
      expect(backendRoute).toBe(`/casino/chess?setup=${setup}#game-setup`);

      expect(
        chessAppRouteForUrl(
          new URL(`http://localhost:3000${backendRoute}`),
          "",
          "http://localhost:3000"
        )
      ).toBe(backendRoute);
      expect(chessFrameSourceForAppRoute(backendRoute!)).toBe(
        `/api/chess/play?setup=${setup}#game-setup`
      );
    }
  });

  it("promotes frontend routes reached by backend form redirects", () => {
    expect(
      chessParentRouteForFrameUrl(
        new URL("http://localhost:3000/casino/chess/play?match=match-1"),
        "http://localhost:3000"
      )
    ).toBe("/casino/chess/play?match=match-1");
    expect(
      chessParentRouteForFrameUrl(
        new URL("http://localhost:3000/api/chess/play"),
        "http://localhost:3000"
      )
    ).toBeNull();
    expect(
      chessParentRouteForFrameUrl(
        new URL("http://localhost:3000/api/chess/challenge/funded/challenge-1"),
        "http://localhost:3000"
      )
    ).toBe("/casino/chess/invite?code=challenge-1");
    expect(
      chessParentRouteForFrameUrl(
        new URL("http://localhost:3000/api/chess/play?tab=lobby"),
        "http://localhost:3000"
      )
    ).toBe("/casino/chess?tab=lobby");
    expect(
      chessParentRouteForFrameUrl(
        new URL("http://localhost:3000/api/chess/learn/puzzles"),
        "http://localhost:3000"
      )
    ).toBe("/casino/chess/puzzles");
    expect(
      chessParentRouteForFrameUrl(
        new URL("https://example.com/casino/chess/play?match=match-1"),
        "http://localhost:3000"
      )
    ).toBeNull();
  });

  it("keeps the selected lobby tab in both parent and frame routes", () => {
    const appRoute = chessAppRouteForUrl(
      new URL("http://localhost:3000/api/chess/play?tab=lobby&setup=hook#game-setup"),
      "",
      "http://localhost:3000"
    );

    expect(appRoute).toBe("/casino/chess?tab=lobby&setup=hook#game-setup");
    expect(chessFrameSourceForAppRoute(appRoute!)).toBe(
      "/api/chess/play?tab=lobby&setup=hook#game-setup"
    );
  });

  it.each(["ai", "friend", "hook"])(
    "opens the %s setup inside the iframe without waiting for a refresh",
    async (setup) => {
      render(<ChessLobbyFrame source="/api/chess/play" />);

      const frame = screen.getByTitle<HTMLIFrameElement>("Ark Chess");
      const frameDocument = frame.contentDocument;
      expect(frameDocument).not.toBeNull();
      frameDocument!.open();
      frameDocument!.write(
        `<body><a href="http://localhost:3000/api/chess/play?setup=${setup}#game-setup">Open</a></body>`
      );
      frameDocument!.close();
      fireEvent.load(frame);
      const setupLink = frameDocument!.querySelector("a")!;
      expect(setupLink.getAttribute("target")).toBe("_top");
      expect(setupLink.dataset.arkRoute).toBe(`/casino/chess?setup=${setup}#game-setup`);
      fireEvent.click(setupLink);

      expect(navigation.push).toHaveBeenCalledWith(`/casino/chess?setup=${setup}#game-setup`);
      await waitFor(() => {
        expect(frame).toHaveAttribute("src", `/api/chess/play?setup=${setup}#game-setup`);
      });
    }
  );

  it("funds a positive friend stake and opens the shareable invite", async () => {
    fundedFriend.create.mockResolvedValue({ challenge: { id: "funded-match" } });
    render(<ChessLobbyFrame source="/api/chess/play?setup=friend" />);

    const frame = screen.getByTitle<HTMLIFrameElement>("Ark Chess");
    const frameDocument = frame.contentDocument!;
    frameDocument.open();
    frameDocument.write(`<body>
      <form data-friend-setup>
        <select name="time_control"><option value="300+3" selected>5+3</option></select>
        <input name="mode" value="rated" checked type="radio">
        <input name="color" value="black" checked type="radio">
        <input name="stake_usdc" value="5">
        <strong data-friend-balance></strong>
        <p data-friend-stake-error hidden></p>
        <button type="submit"><span class="submit-label">Challenge a friend</span></button>
      </form>
    </body>`);
    frameDocument.close();
    fireEvent.load(frame);
    fireEvent.submit(frameDocument.querySelector("form")!);

    await waitFor(() => {
      expect(fundedFriend.create).toHaveBeenCalledWith({
        timeControl: "5+3",
        mode: "invite",
        rated: true,
        color: "black",
        allowTimeExtensions: false,
        videoEnabled: true,
        stakeUsdc: "5",
      });
      expect(navigation.push).toHaveBeenCalledWith("/casino/chess/invite?code=funded-match");
    });
  });

  it("funds the second seat from the full challenge page before joining", async () => {
    fundedFriend.accept.mockResolvedValue({ id: "funded-match" });
    render(<ChessLobbyFrame source="/api/chess/challenge/funded/funded-match" />);

    const frame = screen.getByTitle<HTMLIFrameElement>("Ark Chess");
    const frameDocument = frame.contentDocument!;
    frameDocument.open();
    frameDocument.write(`<body>
      <form data-funded-friend-accept data-match-id="funded-match">
        <input name="stake_usdc" value="5">
        <p data-funded-friend-status></p>
        <button type="submit"><span class="submit-label">Join the game</span></button>
      </form>
    </body>`);
    frameDocument.close();
    fireEvent.load(frame);
    fireEvent.submit(frameDocument.querySelector("form")!);

    await waitFor(() => {
      expect(fundedFriend.accept).toHaveBeenCalledWith("funded-match", "5");
      expect(navigation.push).toHaveBeenCalledWith("/casino/chess/play?match=funded-match");
    });
  });
});
