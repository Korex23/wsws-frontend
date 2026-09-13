import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const shell = readFileSync("features/casino/components/chess-app/chess-site-shell.tsx", "utf8");
const profileBalance = readFileSync(
  "features/casino/components/chess-app/chess-profile-balance.tsx",
  "utf8"
);
const lobbyFrame = readFileSync(
  "features/casino/components/chess-app/chess-lobby-frame.tsx",
  "utf8"
);
const chessLayout = readFileSync("app/(session)/casino/chess/layout.tsx", "utf8");
const styleBoundary = readFileSync(
  "features/casino/components/chess-app/chess-style-boundary.tsx",
  "utf8"
);
const headerActionsCss = readFileSync(
  "features/casino/components/chess-app/chess-profile-balance.module.css",
  "utf8"
);
const siteCss = readFileSync("public/chess/lichess/css/site.css", "utf8");
const themeCss = readFileSync("public/chess/lichess/css/theme.css", "utf8");

describe("chess dark canvas", () => {
  it("uses the same minimal Lichess navigation on React chess pages", () => {
    expect(shell).toContain('id="top"');
    expect(shell).toContain('className="site-title-nav"');
    expect(shell).toContain('className="site-title"');
    expect(shell).toContain('id="topnav"');
    expect(shell).toContain('className="topnav-link"');
    expect(shell).toContain('label: "Play"');
    expect(shell).toContain('label: "Puzzles"');
    expect(shell).toContain('label: "Learn"');
    expect(shell).toContain('label: "Watch"');
    expect(shell).not.toContain('label: "Community"');
    expect(shell).not.toContain('label: "Tools"');
    expect(shell).not.toContain("AccountModal");
    expect(shell).not.toContain("useCasinoWallet");
    expect(shell).not.toContain("usePortfolio");
    expect(shell).toContain("Back to Arkade");
    expect(shell).toContain('className="arkade-mobile"');
    expect(shell).toContain("data-chess-header-actions-space");
    expect(shell).not.toContain("<ChessProfileBalance />");
    expect(profileBalance).toContain('style={{ marginInlineEnd: "16px" }}');
    expect(profileBalance).toContain('href="/casino"');
    expect(profileBalance).toContain(">\n        Arkade\n      </Link>");
    expect(lobbyFrame).not.toContain("<ChessProfileBalance />");
    expect(chessLayout).toContain("<ChessHeaderActions />");
    expect(chessLayout).toContain("<ChessStyleBoundary />");
    expect(shell).not.toContain('<link rel="stylesheet"');
    expect(styleBoundary).toContain('link.dataset.lichessRound === "true"');
    expect(styleBoundary).toContain('href.startsWith("/css/")');
    expect(profileBalance).toContain("data-chess-header-actions");
    expect(profileBalance).toContain("w-[232px]");
    expect(profileBalance).toContain("min-[1020px]:w-[304px]");
    expect(profileBalance).toContain('import { usePortfolio } from "@/hooks/use-portfolio"');
    expect(profileBalance).toContain('usePortfolio({ scope: "base" })');
    expect(profileBalance).not.toContain("useCasinoWallet");
    expect(profileBalance).not.toContain("fetch(");
    expect(headerActionsCss).toContain(".arkadeAction");
    expect(headerActionsCss).toContain(".profileAction");
    expect(headerActionsCss).toContain(".legacyAction");
    expect(headerActionsCss).toContain("padding-inline: 0.75rem");
  });

  it("uses the Twitter/X black canvas across React and Lichess pages", () => {
    expect(shell).toContain('"relative bg-black text-white"');
    expect(shell).not.toContain("linear-gradient(180deg, #0d1012");
    expect(lobbyFrame).toContain(
      "fixed inset-0 h-dvh w-full border-0 bg-black transition-opacity duration-150"
    );
    expect(siteCss).toMatch(/body \{\s+background: #000;/);
  });

  it("preserves the existing component surface colors", () => {
    expect(themeCss).toContain("--c-bg: hsl(var(---site-hue) 7% 14%);");
    expect(themeCss).toContain("--c-bg-mid: hsl(var(---site-hue) 7% 16%);");
    expect(themeCss).toContain("--c-bg-low: hsl(var(---site-hue) 7% 22%);");
  });
});
