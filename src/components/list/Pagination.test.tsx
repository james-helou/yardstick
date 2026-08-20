import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { pageWindow } from "@/lib/list/query";
import { Pagination } from "./Pagination";

const href = (page: number) => `?page=${page}`;

describe("Pagination", () => {
  it("tells the reader exactly where they are", () => {
    render(<Pagination window={pageWindow({ total: 95, page: 3 })} noun="prospects" href={href} />);
    expect(screen.getByText(/41.*60.*95/)).toBeInTheDocument();
  });

  it("offers no previous link on the first page", () => {
    render(<Pagination window={pageWindow({ total: 95, page: 1 })} noun="prospects" href={href} />);
    expect(screen.queryByRole("link", { name: /previous/i })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /next/i })).toHaveAttribute("href", "?page=2");
  });

  it("offers no next link on the last page", () => {
    render(<Pagination window={pageWindow({ total: 95, page: 5 })} noun="prospects" href={href} />);
    expect(screen.getByRole("link", { name: /previous/i })).toHaveAttribute("href", "?page=4");
    expect(screen.queryByRole("link", { name: /next/i })).not.toBeInTheDocument();
  });

  it("renders nothing at all when everything fits on one page", () => {
    const { container } = render(
      <Pagination window={pageWindow({ total: 12, page: 1 })} noun="prospects" href={href} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
})
