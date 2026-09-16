// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MoveOldMoneyFrame } from "@/features/migrate/components/move-old-money-sheet";

describe("MoveOldMoneyFrame", () => {
  it("closes on Escape, the backdrop and the close button by default", () => {
    const onClose = vi.fn();
    render(
      <MoveOldMoneyFrame onClose={onClose}>
        <p>body</p>
      </MoveOldMoneyFrame>
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    for (const button of screen.getAllByLabelText("Close")) fireEvent.click(button);
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  // The gate: the only way out is whatever the children offer.
  it("offers no way out when not dismissible", () => {
    const onClose = vi.fn();
    render(
      <MoveOldMoneyFrame onClose={onClose} dismissible={false}>
        <p>body</p>
      </MoveOldMoneyFrame>
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByLabelText("Close")).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
