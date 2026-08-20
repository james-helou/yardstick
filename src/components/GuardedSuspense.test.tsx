import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GuardedSuspense } from "./GuardedSuspense";

/**
 * The classic throw-a-promise resource. `use()` on an uncached promise never pings
 * React under jsdom, so tests drive Suspense the way the runtime actually does.
 */
function resource<T>(promise: Promise<T>) {
  let status: "pending" | "done" | "error" = "pending";
  let result: T | unknown;
  const suspender = promise.then(
    (v) => {
      status = "done";
      result = v;
    },
    (e) => {
      status = "error";
      result = e;
    },
  );
  return {
    read(): T {
      if (status === "pending") throw suspender;
      if (status === "error") throw result;
      return result as T;
    },
  };
}

type Resource = ReturnType<typeof resource<string>>;

/** Only the two deadline tests fake timers; the rest need React's scheduler intact. */
const fakeTimers = () => vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
afterEach(() => vi.useRealTimers());

const never: Resource = { read: () => { throw new Promise<string>(() => {}); } };

function Reads({ value }: { value: Resource }) {
  return <p>{value.read()}</p>;
}

function Explodes(): never {
  throw new Error("upstream provider returned 429");
}

describe("GuardedSuspense", () => {
  it("renders children once they resolve", async () => {
    render(
      <GuardedSuspense label="Rankings" fallback={<p>loading</p>}>
        <Reads value={resource(Promise.resolve("ranked #3"))} />
      </GuardedSuspense>,
    );
    await act(async () => {});
    expect(screen.getByText("ranked #3")).toBeInTheDocument();
  });

  it("shows the skeleton before the deadline", () => {
    fakeTimers();
    render(
      <GuardedSuspense label="Rankings" fallback={<p>loading</p>} timeoutMs={1000}>
        <Reads value={never} />
      </GuardedSuspense>,
    );
    act(() => {
      vi.advanceTimersByTime(900);
    });
    expect(screen.getByText("loading")).toBeInTheDocument();
  });

  it("replaces a skeleton that outlives its deadline with a real error", () => {
    fakeTimers();
    render(
      <GuardedSuspense label="Rankings" fallback={<p>loading</p>} timeoutMs={1000}>
        <Reads value={never} />
      </GuardedSuspense>,
    );
    act(() => {
      vi.advanceTimersByTime(1001);
    });
    expect(screen.queryByText("loading")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(/Rankings/);
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });

  it("catches an error thrown while rendering", async () => {
    render(
      <GuardedSuspense label="Rankings" fallback={<p>loading</p>}>
        <Explodes />
      </GuardedSuspense>,
    );
    await act(async () => {});
    expect(screen.getByRole("alert")).toHaveTextContent(/Rankings/);
  });

  it("retries when asked and can then succeed", async () => {
    let shouldFail = true;
    function Flaky() {
      if (shouldFail) throw new Error("first attempt fails");
      return <p>ranked #3</p>;
    }

    render(
      <GuardedSuspense label="Rankings" fallback={<p>loading</p>}>
        <Flaky />
      </GuardedSuspense>,
    );
    await act(async () => {});
    expect(screen.getByRole("alert")).toBeInTheDocument();

    shouldFail = false;
    await act(async () => {
      screen.getByRole("button", { name: /try again/i }).click();
    });
    expect(screen.getByText("ranked #3")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("clears the deadline once content arrives so no late error fires", async () => {
    fakeTimers();
    render(
      <GuardedSuspense label="Rankings" fallback={<p>loading</p>} timeoutMs={1000}>
        <Reads value={resource(Promise.resolve("ranked #3"))} />
      </GuardedSuspense>,
    );
    await act(async () => {});
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.getByText("ranked #3")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
