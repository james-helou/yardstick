import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { KpiTiles } from "./KpiTiles";

describe("KpiTiles", () => {
  it("renders a label and value per tile", () => {
    render(
      <KpiTiles
        tiles={[
          { label: "Prospects", value: "128" },
          { label: "Scanned this week", value: "31" },
        ]}
      />,
    );
    expect(screen.getByText("Prospects")).toBeInTheDocument();
    expect(screen.getByText("128")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("encodes state in form, not only in colour", () => {
    render(<KpiTiles tiles={[{ label: "Failed scans", value: "3", tone: "critical" }]} />);
    const tile = screen.getByRole("listitem");
    expect(tile).toHaveAttribute("data-tone", "critical");
    expect(tile).toHaveTextContent(/needs attention/i);
  });

  it("says so plainly when a figure is not available yet", () => {
    render(<KpiTiles tiles={[{ label: "Avg. rank", value: null }]} />);
    expect(screen.getByText(/not yet measured/i)).toBeInTheDocument();
  });
});
