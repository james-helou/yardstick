import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SearchInput } from "./SearchInput";

afterEach(() => vi.useRealTimers());

describe("SearchInput", () => {
  it("does not fire on every keystroke", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const onSearch = vi.fn();
    render(<SearchInput label="Search prospects" onSearch={onSearch} delayMs={300} />);
    const input = screen.getByRole("searchbox", { name: /search prospects/i });

    for (const value of ["a", "ac", "acm", "acme"]) {
      fireEvent.change(input, { target: { value } });
    }
    expect(onSearch).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(onSearch).toHaveBeenCalledWith("acme");
  });

  it("still fires when the parent re-renders during the debounce window", () => {
    // The router-bound wrapper builds a new callback whenever the URL object changes.
    // If the debounce restarts on that, a list that re-renders every 300ms never
    // searches at all, which is exactly what happened in the browser.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const onSearch = vi.fn();
    const { rerender } = render(<SearchInput label="Search" onSearch={() => onSearch("stale")} delayMs={300} />);
    const input = screen.getByRole("searchbox");

    fireEvent.change(input, { target: { value: "acme" } });
    for (let i = 0; i < 5; i += 1) {
      act(() => vi.advanceTimersByTime(100));
      rerender(<SearchInput label="Search" onSearch={(term) => onSearch(term)} delayMs={300} />);
    }
    act(() => vi.advanceTimersByTime(300));

    expect(onSearch).toHaveBeenCalledTimes(1);
    // The newest callback runs, not the one captured when the user started typing.
    expect(onSearch).toHaveBeenCalledWith("acme");
  });

  it("fires again for a genuinely new term", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const onSearch = vi.fn();
    render(<SearchInput label="Search" onSearch={onSearch} delayMs={200} />);
    const input = screen.getByRole("searchbox");

    fireEvent.change(input, { target: { value: "acme" } });
    act(() => vi.advanceTimersByTime(200));
    fireEvent.change(input, { target: { value: "roofing" } });
    act(() => vi.advanceTimersByTime(200));

    expect(onSearch.mock.calls.map((c) => c[0])).toEqual(["acme", "roofing"]);
  });

  it("does not re-fire when the term settles back to what was already searched", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const onSearch = vi.fn();
    render(<SearchInput label="Search" defaultValue="acme" onSearch={onSearch} delayMs={200} />);
    const input = screen.getByRole("searchbox");

    fireEvent.change(input, { target: { value: "acmex" } });
    fireEvent.change(input, { target: { value: "acme" } });
    act(() => vi.advanceTimersByTime(200));

    expect(onSearch).not.toHaveBeenCalled();
  });

  it("normalises whitespace before searching", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const onSearch = vi.fn();
    render(<SearchInput label="Search" onSearch={onSearch} delayMs={100} />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "  acme   roofing  " } });
    act(() => vi.advanceTimersByTime(100));
    expect(onSearch).toHaveBeenCalledWith("acme roofing");
  });

  it("shows the current term so a reader knows what they are looking at", () => {
    render(<SearchInput label="Search" defaultValue="acme" onSearch={() => {}} />);
    expect(screen.getByRole("searchbox")).toHaveValue("acme");
  });
});
