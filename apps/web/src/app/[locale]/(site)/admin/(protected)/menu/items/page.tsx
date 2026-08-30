import Link from 'next/link';
import { UtensilsCrossed } from 'lucide-react';
import {
  StaffEmptyState,
  StaffPage,
  StaffPageHeader,
} from '@/components/staff/StaffPrimitives';

export default async function AdminMenuItemsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const safeLocale = locale === 'zh' ? 'zh' : 'en';
  const isZh = safeLocale === 'zh';

  return (
    <StaffPage>
      <StaffPageHeader
        eyebrow={isZh ? '菜单' : 'Catalog'}
        title={isZh ? '菜品管理' : 'Item management'}
        description={
          isZh
            ? '菜品管理工作区已预留。Catalog 后端与页面拆分时，会把现有菜单页中的菜品创建、编辑、上下架、图片、包装和选项绑定迁入这里。'
            : 'This item workspace is reserved. Item create, edit, availability, images, packaging and option bindings will move here during the Catalog split.'
        }
      />
      <StaffEmptyState
        icon={<UtensilsCrossed className="size-5" aria-hidden="true" />}
        title={isZh ? '菜品管理将在后续 Catalog 拆分阶段迁入' : 'Item management will move here with the Catalog split'}
        description={
          isZh
            ? '本轮不搬动现有菜单业务逻辑，避免在后端边界尚未完成前做一次临时拆分。当前完整菜单维护仍保留在旧页面。'
            : 'The existing combined menu behavior stays intact in this foundation pass so it is not split twice before the Catalog boundary is ready.'
        }
        actions={
          <Link
            href={`/${safeLocale}/admin/menu`}
            className="inline-flex min-h-10 items-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 outline-none transition-colors hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-slate-300"
          >
            {isZh ? '打开现有菜单维护页' : 'Open existing menu workspace'}
          </Link>
        }
      />
    </StaffPage>
  );
}
