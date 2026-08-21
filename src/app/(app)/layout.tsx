import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { signOut } from "@/lib/auth/actions";
import { NoWorkspaceError, resolveWorkspace } from "@/lib/auth/workspace";
import { APP_NAME } from "@/lib/version";

/** Every page beneath this reads the database for the signed-in user. */
export const dynamic = "force-dynamic";

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
      <header className="border-b">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-4 px-6 py-3">
          <Link href="/businesses" className="font-semibold tracking-tight">
            {APP_NAME}
          </Link>
          <nav className="flex gap-4 text-sm">
            <Link href="/businesses" className="hover:underline">
              Businesses
            </Link>
            <Link href="/scans" className="hover:underline">
              Scans
            </Link>
            <Link href="/leads" className="hover:underline">
              Leads
            </Link>
            <Link href="/widget" className="hover:underline">
              Widget
            </Link>
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="text-neutral-600">{workspaceName}</span>
            <form action={signOut}>
              <button type="submit" className="rounded border px-2 py-1 hover:bg-neutral-50">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">{children}</main>
    </div>
  );
}
