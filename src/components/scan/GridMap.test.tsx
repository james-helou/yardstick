import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GridMap, type GridCell } from "./GridMap";

const cells = (ranks: (number | null)[]): GridCell[] =>
  ranks.map((rank, i) => ({ latitude: 45 + i / 100, longitude: -73, rank }));

describe("GridMap", () => {
  it("draws one cell a point, with the position in it", () => {
    render(<GridMap points={cells([1, 2, 3, 4, 5, 6, 7, 8, 9])} keyword="dentist" />);
    expect(screen.getByRole("img", { name: /3 by 3/ })).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("9")).toBeInTheDocument();
  });

  it("shows a business that does not appear as a dash, not a zero", () => {
    render(<GridMap points={cells([1, null, 3, 4])} />);
    expect(screen.getByText("–")).toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("treats a rank past the horizon the same as absent", () => {
    render(<GridMap points={cells([1, 2, 3, 99])} />);
    expect(screen.getByText("–")).toBeInTheDocument();
  });

  it("renders nothing rather than a broken map when the points are not a square", () => {
    const { container } = render(<GridMap points={cells([1, 2, 3])} />);
    expect(container).toBeEmptyDOMElement();
  });
});
