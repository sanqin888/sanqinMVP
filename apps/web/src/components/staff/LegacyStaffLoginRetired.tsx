import Link from 'next/link';
import type { Locale } from '@/lib/i18n/locales';

export function LegacyStaffLoginRetired({
  locale,
  appName,
}: {
  locale: Locale;
  appName: string;
}) {
  const isZh = locale === 'zh';

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md rounded-2xl border bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">
          {isZh ? '旧版员工应用已停用' : 'Legacy staff app retired'}
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          {isZh
            ? `当前打开的是旧版 ${appName} 登录入口，已不再提供登录。`
            : `You opened the retired ${appName} login entry. Sign-in is no longer available here.`}
        </p>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          {isZh
            ? '请先从设备卸载旧版 SanQ PWA，再重新打开网站安装最新版本，然后重新登录。'
            : 'Uninstall the old SanQ PWA from this device, reopen the website, install the latest version, then sign in again.'}
        </p>

        <Link
          href={`/${locale}`}
          className="mt-6 inline-flex w-full items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
        >
          {isZh ? '返回 SanQ 网站' : 'Open SanQ website'}
        </Link>
      </div>
    </div>
  );
}
