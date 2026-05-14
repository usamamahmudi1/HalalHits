"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

function MapIcon({ active }: { active: boolean }) {
  return (
    <svg
      className={active ? "h-6 w-6 text-emerald-700" : "h-6 w-6 text-emerald-600/80"}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
    </svg>
  );
}

function PlusIcon({ active }: { active: boolean }) {
  return (
    <svg
      className={active ? "h-6 w-6 text-emerald-700" : "h-6 w-6 text-emerald-600/80"}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function MoonIcon({ active }: { active: boolean }) {
  return (
    <svg
      className={active ? "h-6 w-6 text-emerald-700" : "h-6 w-6 text-emerald-600/80"}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
    </svg>
  );
}

export function BottomNav() {
  const pathname = usePathname();
  const home = pathname === "/";
  const submit = pathname === "/submit" || pathname.startsWith("/submit/");
  const prayer = pathname === "/prayer" || pathname.startsWith("/prayer/");

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-emerald-200/90 bg-white/95 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-4px_20px_rgba(6,95,70,0.08)] backdrop-blur-md"
      aria-label="Main navigation"
    >
      <div className="mx-auto flex max-w-2xl">
        <Link
          href="/"
          className={`flex flex-1 flex-col items-center justify-center gap-0.5 py-2 ${
            home ? "text-emerald-800" : "text-emerald-600/75 hover:text-emerald-800"
          }`}
          aria-current={home ? "page" : undefined}
        >
          <MapIcon active={home} />
          <span className="text-[11px] font-semibold tracking-wide">Home</span>
        </Link>
        <Link
          href="/submit"
          className={`flex flex-1 flex-col items-center justify-center gap-0.5 py-2 ${
            submit ? "text-emerald-800" : "text-emerald-600/75 hover:text-emerald-800"
          }`}
          aria-current={submit ? "page" : undefined}
        >
          <PlusIcon active={submit} />
          <span className="text-[11px] font-semibold tracking-wide">Submit</span>
        </Link>
        <Link
          href="/prayer"
          className={`flex flex-1 flex-col items-center justify-center gap-0.5 py-2 ${
            prayer ? "text-emerald-800" : "text-emerald-600/75 hover:text-emerald-800"
          }`}
          aria-current={prayer ? "page" : undefined}
        >
          <MoonIcon active={prayer} />
          <span className="text-[11px] font-semibold tracking-wide">Prayer</span>
        </Link>
      </div>
    </nav>
  );
}
