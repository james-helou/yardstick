import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EmptyState } from "./EmptyState";

describe("EmptyState", () => {
  it("distinguishes an empty collection from an empty search", () => {
    const { rerender } = render(<EmptyState noun="prospects" />);
    expect(screen.getByText(/no prospects yet/i)).toBeInTheDocument();

    rerender(<EmptyState noun="prospects" search="acme" />);
    expect(screen.getByText(/acme/)).toBeInTheDocument();
    expect(screen.queryByText(/no prospects yet/i)).not.toBeInTheDocument();
  });

  it("offers a way out of an empty search", () => {
    render(<EmptyState noun="prospects" search="acme" onClearSearch={() => {}} />);
    expect(screen.getByRole("button", { name: /clear search/i })).toBeInTheDocument();
  });

  it("shows the call to action only when there is genuinely nothing", () => {
    const { rerender } = render(
      <EmptyState noun="prospects" action={<button type="button">Add a prospect</button>} />,
    );
    expect(screen.getByRole("button", { name: /add a prospect/i })).toBeInTheDocument();

    rerender(
      <EmptyState
        noun="prospects"
        search="acme"
        action={<button type="button">Add a prospect</button>}
      />,
    );
    expect(screen.queryByRole("button", { name: /add a prospect/i })).not.toBeInTheDocument();
  });
});
