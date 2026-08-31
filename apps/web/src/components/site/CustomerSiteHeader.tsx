"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSelectedLayoutSegments } from "next/navigation";
import type { MouseEvent, ReactNode } from "react";
import LocaleSwitcher from "@/components/LocaleSwitcher";
import { useSession } from "@/lib/auth-session";
import { PersistentCartProvider, usePersistentCart } from "@/lib/cart";

type Props = {
  locale: "zh" | "en";
};

type CustomerSiteShellBoundaryProps = {
  children: ReactNode;
  customerHeader: ReactNode;
  customerFooter: ReactNode;
  localePreferenceSync: ReactNode;
};

export function CustomerSiteShellBoundary({
  children,
  customerHeader,
  customerFooter,
  localePreferenceSync,
}: CustomerSiteShellBoundaryProps) {
  const segments = useSelectedLayoutSegments();
  const isBackOfficeRoute = segments.includes("admin") || segments.includes("accounting");

  if (isBackOfficeRoute) {
    return <>{children}</>;
  }

  return (
    <PersistentCartProvider>
      <div className="min-h-screen bg-[#fffdfa] text-stone-900">
        {localePreferenceSync}
        {customerHeader}

        <main className="mx-auto w-full max-w-[1600px] px-4 py-0 sm:px-6 lg:px-8">
          {children}
        </main>

        {customerFooter}
      </div>
    </PersistentCartProvider>
  );
}

export default function CustomerSiteHeader({ locale }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const { totalQuantity } = usePersistentCart();
  const isZh = locale === "zh";
  const isMemberLoggedIn = Boolean(session?.user?.userStableId);
  const homeHref = `/${locale}`;
  const isHome = pathname === homeHref || pathname === `${homeHref}/`;
  const currentPath = pathname || homeHref;
  const membershipHref = isMemberLoggedIn
    ? `/${locale}/membership`
    : `/${locale}/membership/login?redirect=${encodeURIComponent(currentPath)}`;

  const openCart = () => {
    if (isHome) {
      window.dispatchEvent(new CustomEvent("sanq:open-cart"));
      return;
    }
    router.push(`${homeHref}?cart=1`);
  };

  const scrollToHomeSection = (
    event: MouseEvent<HTMLAnchorElement>,
    sectionId: string,
  ) => {
    if (!isHome) return;
    const target = document.getElementById(sectionId);
    if (!target) return;

    event.preventDefault();
    const header = document.querySelector<HTMLElement>(
      "[data-customer-site-header]",
    );
    const headerHeight = header?.offsetHeight ?? 76;
    const top =
      target.getBoundingClientRect().top + window.scrollY - headerHeight - 12;
    window.history.pushState(null, "", `#${sectionId}`);
    window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  };

  return (
    <header
      data-customer-site-header
      className="sticky top-0 z-40 border-b border-[#87362E]/10 bg-[#fffaf5]/95 backdrop-blur-xl"
    >
      <div className="mx-auto flex h-[68px] w-full max-w-[1600px] items-center gap-1.5 px-4 sm:gap-3 sm:px-6 lg:h-[76px] lg:px-8">
        <Link
          href={homeHref}
          className="flex shrink-0 items-center gap-1 sm:gap-2"
          aria-label={isZh ? "三秦肉夹馍" : "SanQ Roujiamo"}
        >
          <div className="relative h-10 w-10 shrink-0 sm:h-12 sm:w-12 lg:h-14 lg:w-14">
            <Image
              src="/images/sanqinLOGO.png"
              alt=""
              fill
              priority
              sizes="(min-width: 1024px) 56px, (min-width: 640px) 48px, 40px"
              className="object-contain"
            />
          </div>
          <span className="whitespace-nowrap text-[0.95rem] font-semibold leading-none tracking-[-0.025em] text-[#87362E] sm:text-[1.15rem] lg:text-[1.3rem]">
            {isZh ? "三秦肉夹馍" : "SanQ Roujiamo"}
          </span>
        </Link>

        <nav
          className="ml-5 hidden items-center gap-1 lg:flex"
          aria-label={isZh ? "主导航" : "Primary navigation"}
        >
          <Link
            href={`${homeHref}#menu`}
            onClick={(event) => scrollToHomeSection(event, "menu")}
            className="rounded-full px-4 py-2 text-sm font-semibold text-stone-700 transition hover:bg-[#87362E]/10 hover:text-[#87362E]"
          >
            {isZh ? "菜单" : "Menu"}
          </Link>
          <Link
            href={`${homeHref}#daily-special`}
            onClick={(event) => scrollToHomeSection(event, "daily-special")}
            className="rounded-full px-4 py-2 text-sm font-semibold text-stone-700 transition hover:bg-[#87362E]/10 hover:text-[#87362E]"
          >
            {isZh ? "今日特价" : "Daily Special"}
          </Link>
          <Link href={`/${locale}/legal/contact`} className="rounded-full px-4 py-2 text-sm font-semibold text-stone-700 transition hover:bg-[#87362E]/10 hover:text-[#87362E]">
            {isZh ? "门店" : "Visit"}
          </Link>
        </nav>

        <div className="ml-auto flex min-w-0 items-center gap-1.5 sm:gap-3">
          <Link
            href={membershipHref}
            className="inline-flex h-10 shrink-0 items-center justify-center rounded-full border border-[#87362E] px-2.5 text-[11px] font-bold text-[#87362E] transition hover:bg-[#87362E] hover:text-white sm:px-5 sm:text-sm lg:bg-[#87362E] lg:text-white lg:hover:bg-[#6f2c26]"
          >
            <span className="sm:hidden">{isMemberLoggedIn ? (isZh ? "会员" : "Member") : (isZh ? "登录/注册" : "Login")}</span>
            <span className="hidden sm:inline">
              {isMemberLoggedIn ? (isZh ? "会员中心" : "Member Center") : (isZh ? "会员登录 / 注册" : "Member Login / Sign Up")}
            </span>
          </Link>

          <LocaleSwitcher locale={locale} />

          <button
            type="button"
            onClick={openCart}
            className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[#87362E]/20 bg-white text-[#87362E] transition hover:border-[#87362E]/40 hover:bg-[#fff3ea]"
            aria-label={isZh ? "打开购物车" : "Open cart"}
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <path d="M3 4h2l1.8 10.2a2 2 0 0 0 2 1.65h7.9a2 2 0 0 0 1.95-1.55L20 8H6.2" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="9.2" cy="19" r="1.25" />
              <circle cx="17.2" cy="19" r="1.25" />
            </svg>
            {totalQuantity > 0 ? (
              <span className="absolute -right-1 -top-1 grid min-h-5 min-w-5 place-items-center rounded-full bg-[#87362E] px-1 text-[10px] font-bold text-white ring-2 ring-[#fffaf5]">
                {totalQuantity > 99 ? "99+" : totalQuantity}
              </span>
            ) : null}
          </button>
        </div>
      </div>
    </header>
  );
}
