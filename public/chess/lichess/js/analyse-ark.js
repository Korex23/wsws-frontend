import { start_default as start } from "/compiled/lib.MVDLUPAI.js";
import { patch } from "/compiled/lib.UZWUG6PB.js";

let destroyLayout = () => {};

function keepChatAligned(root) {
  destroyLayout();

  const sync = () => {
    const board = root.querySelector(".analyse__board .cg-wrap");
    const meta = root.querySelector(".analyse__side .game__meta");
    const chat = root.querySelector(".mchat");
    if (!(board instanceof HTMLElement) || !(meta instanceof HTMLElement) || !(chat instanceof HTMLElement)) return;

    chat.style.height = `${Math.max(160, board.offsetHeight - meta.offsetHeight - 16)}px`;
  };

  const resizeObserver = new ResizeObserver(sync);
  const mutationObserver = new MutationObserver(sync);
  const board = root.querySelector(".analyse__board");
  const meta = root.querySelector(".analyse__side");
  if (board) resizeObserver.observe(board);
  if (meta) resizeObserver.observe(meta);
  mutationObserver.observe(root, { childList: true, subtree: true });
  window.addEventListener("resize", sync);
  requestAnimationFrame(sync);

  destroyLayout = () => {
    resizeObserver.disconnect();
    mutationObserver.disconnect();
    window.removeEventListener("resize", sync);
  };
}

// Keep Lichess's complete analysis controller and view, but let Ark own the
// transport. The stock replay bootstrap always opens /watch/... on Lichess's
// socket protocol, which is not compatible with the Ark gateway.
export async function initModule({ mode, cfg }) {
  await site.asset.loadPieces;
  if (mode !== "replay") throw new Error(`Unsupported Ark analysis mode: ${mode}`);

  cfg.$side = $(".analyse__side").clone();
  cfg.$underboard = $(".analyse__underboard").clone();
  cfg.socketSend ||= () => undefined;
  const controller = start(patch)(cfg);
  const root = document.querySelector("main.analyse");
  if (root instanceof HTMLElement) keepChatAligned(root);
  return controller;
}

export function destroyModule() {
  destroyLayout();
  destroyLayout = () => {};
}
