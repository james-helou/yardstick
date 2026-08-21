"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * A destination in the workspace nav.
 *
 * There is one nav in the DOM at every width: a strip that scrolls sideways on a
 * phone and a plain row on a desktop. Nothing is duplicated into a second menu,
 * so every link keeps one accessible name and nothing is hidden from a reader.
 */
export function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const current = pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link href={href} className="nav-link" aria-current={current ? "page" : undefined}>
      {children}
    </Link>
  );
}
