import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { signOut } from "@/lib/auth/actions";
import { NoWorkspaceError, resolveWorkspace } from "@/lib/auth/workspace";
import { APP_NAME } from "@/lib/version";
import { Mark } from "@/components/app/Mark";
import { NavLink } from "@/components/app/NavLink";

/** Every page beneath this reads the database for the signed-in user. */
export const dynamic = "force-dynamic";

const DESTINATIONS = [
  { href: "/businesses", label: "Businesses" },
  { href: "/scans", label: "Scans" },
  { href: "/leads", label: "Leads" },
  { href: "/proposals", label: "Proposals" },
  { href: "/follow-ups", label: "Follow-ups" },
  { href: "/clients", label: "Clients" },
  { href: "/catalog", label: "Catalogue" },
  { href: "/widget", label: "Widget" },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // This guard covers rendering only. It does NOT protect the server actions beneath it,
  // which are their own entry points and re-check for themselves.
  let workspaceName: string;
  try {
    const workspace = await resolveWorkspace(await headers());
    workspaceName = workspace.org.name;
  } catch (error) {
    redirect(error instanceof NoWorkspaceError ? "/welcome" : "/sign-in");
  }

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-20 border-b border-line bg-surface-2/95 backdrop-blur-[2px]">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 pt-2.5 sm:px-6">
          <Link
            href="/businesses"
            className="flex items-center gap-2 text-md font-semibold tracking-tight"
          >
            <Mark className="h-4 w-4" />
            {APP_NAME}
          </Link>
          <span className="ml-auto min-w-0 truncate text-xs text-ink-muted" title={workspaceName}>
            {workspaceName}
          </span>
          <form action={signOut}>
            <button type="submit" className="btn btn-ghost btn-sm">
              Sign out
            </button>
          </form>
        </div>

        <nav aria-label="Workspace" className="mx-auto w-full max-w-6xl px-4 sm:px-6">
          <div className="nav-strip">
            {DESTINATIONS.map((destination) => (
              <NavLink key={destination.href} href={destination.href}>
                {destination.label}
              </NavLink>
            ))}
          </div>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  );
}
