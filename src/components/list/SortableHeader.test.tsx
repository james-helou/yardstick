import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SortableHeader } from "./SortableHeader";

const href = (sort: string, dir: string) => `?sort=${sort}&dir=${dir}`;

function renderHeader(props: Partial<Parameters<typeof SortableHeader>[0]> = {}) {
  return render(
    <table>
      <thead>
        <tr>
          <SortableHeader
            column="name"
            label="Business"
            activeSort="createdAt"
            activeDirection="desc"
            href={href}
            {...props}
          />
        </tr>
      </thead>
    </table>,
  );
}

describe("SortableHeader", () => {
  it("reports no sort when it is not the active column", () => {
    renderHeader();
    expect(screen.getByRole("columnheader")).toHaveAttribute("aria-sort", "none");
  });

  it("reports its direction when it is active", () => {
    renderHeader({ activeSort: "name", activeDirection: "asc" });
    expect(screen.getByRole("columnheader")).toHaveAttribute("aria-sort", "ascending");
  });

  it("links to ascending when the column is not yet sorted", () => {
    renderHeader();
    expect(screen.getByRole("link")).toHaveAttribute("href", "?sort=name&dir=asc");
  });

  it("flips direction when the column is already sorted", () => {
    renderHeader({ activeSort: "name", activeDirection: "asc" });
    expect(screen.getByRole("link")).toHaveAttribute("href", "?sort=name&dir=desc");
  });
});
