import { signOutOfPortal } from "./actions";

/**
 * The client's side of the product. Deliberately not the agency's chrome: there is no
 * workspace switcher, no navigation into anything else, and nothing here reads a
 * membership. A client is signed in and holds grants, which is a different thing.
 */
export const dynamic = "force-dynamic";

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-4 px-6 py-3">
          <span className="font-semibold tracking-tight">Your results</span>
          <div className="ml-auto text-sm">
            <form action={signOutOfPortal}>
              <button type="submit" className="btn btn-secondary btn-sm">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-8">{children}</main>
    </div>
  );
}
