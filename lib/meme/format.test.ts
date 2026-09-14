import { describe, expect, it } from "vitest";
import { changeDirection, compactUsd } from "@/lib/meme/format";

// The contract: null means "not currently available", never zero. A missing
// change is neither up nor down, and a real zero is a figure, not a blank.
describe("changeDirection", () => {
  it("is null for a change the service did not publish", () => {
    expect(changeDirection(null)).toBeNull();
    expect(changeDirection(undefined)).toBeNull();
  });

  it("is null for a value that is not a number", () => {
    expect(changeDirection("")).toBeNull();
    expect(changeDirection("n/a")).toBeNull();
  });

  it("follows the sign of a published change", () => {
    expect(changeDirection("12.5")).toBe("up");
    expect(changeDirection("-0.42")).toBe("down");
    expect(changeDirection("0")).toBe("up");
  });
});

describe("compactUsd", () => {
  it("renders a real zero as $0", () => {
    expect(compactUsd("0")).toBe("$0");
    expect(compactUsd("0.00")).toBe("$0");
  });

  it("renders only a missing or unreadable figure as a dash", () => {
    expect(compactUsd(null)).toBe("—");
    expect(compactUsd("")).toBe("—");
    expect(compactUsd("NaN")).toBe("—");
  });

  it("compacts a published figure", () => {
    expect(compactUsd("1887590")).toBe("$1.89M");
    expect(compactUsd("56699")).toBe("$56.7K");
  });
});
