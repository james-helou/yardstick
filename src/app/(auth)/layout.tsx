import Link from "next/link";
import { APP_NAME } from "@/lib/version";
import { Mark } from "@/components/app/Mark";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-5 py-12 sm:py-16">
      <Link href="/" className="flex items-center gap-2 text-md font-semibold tracking-tight">
        <Mark className="h-4 w-4" />
        {APP_NAME}
      </Link>
      <div className="panel p-5 sm:p-6">{children}</div>
    </main>
  );
}
