import { fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import messages from "@/messages/en.json";
import { MemeCatalogMore, MemeViewSwitch } from "@/features/trade/components/meme-catalog-controls";

// The two controls every catalogue list shares (desk, grid, phone tab): the
// Curated / All switch over DISCOVERY_POLICY, and the count with its
// "Load more". The count is the server's total; the filtered size is its own
// number beside it.

function wrap(ui: ReactNode) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {ui}
    </NextIntlClientProvider>
  );
}

describe("MemeViewSwitch", () => {
  it("names both views and marks the one in force", () => {
    wrap(<MemeViewSwitch value="curated" onChange={vi.fn()} />);
    const group = screen.getByRole("group", { name: "Which memecoins to list" });
    expect(within(group).getByRole("button", { name: "Curated" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(within(group).getByRole("button", { name: "All" })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
  });

  it("hands back the view picked", () => {
    const onChange = vi.fn();
    wrap(<MemeViewSwitch value="curated" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "All" }));
    expect(onChange).toHaveBeenCalledWith("all");
  });
});

describe("MemeCatalogMore", () => {
  const props = {
    loaded: 500,
    total: 11_502,
    shownCount: 156,
    hasMore: true,
    loadingMore: false,
    failed: false,
    onLoadMore: vi.fn(),
  };

  it("counts what is loaded against the server's total, and what the view shows", () => {
    wrap(<MemeCatalogMore {...props} />);
    expect(screen.getByText("500 of 11,502")).toBeInTheDocument();
    expect(screen.getByText("156 shown")).toBeInTheDocument();
  });

  it("loads the next page on demand", () => {
    const onLoadMore = vi.fn();
    wrap(<MemeCatalogMore {...props} onLoadMore={onLoadMore} />);
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(onLoadMore).toHaveBeenCalledOnce();
  });

  it("offers no more once the pages cover the total", () => {
    wrap(<MemeCatalogMore {...props} loaded={11_502} hasMore={false} />);
    expect(screen.getByText("11,502 of 11,502")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  });

  it("holds the button while a page is in flight", () => {
    wrap(<MemeCatalogMore {...props} loadingMore />);
    expect(screen.getByRole("button", { name: "Loading more…" })).toBeDisabled();
  });

  it("says a failed page failed, and keeps the way to ask again", () => {
    wrap(<MemeCatalogMore {...props} failed />);
    expect(screen.getByText("Couldn't load more.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Load more" })).toBeEnabled();
  });

  it("draws nothing before the first page has told it the total", () => {
    const { container } = wrap(<MemeCatalogMore {...props} total={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
