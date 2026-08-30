import Link from 'next/link';
import { Tags } from 'lucide-react';
import {
  StaffEmptyState,
  StaffPage,
  StaffPageHeader,
} from '@/components/staff/StaffPrimitives';

export default async function AdminMenuCategoriesPage({
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
        title={isZh ? '分类管理' : 'Category management'}
        description={
          isZh
            ? '分类管理工作区已预留。Catalog 后端与页面拆分时，会把现有菜单页中的分类创建、编辑、排序和启停功能迁入这里。'
            : 'This category workspace is reserved. Category create, edit, ordering and availability controls will move here during the Catalog split.'
        }
      />
      <StaffEmptyState
        icon={<Tags className="size-5" aria-hidden="true" />}
        title={isZh ? '分类管理将在后续 Catalog 拆分阶段迁入' : 'Category management will move here with the Catalog split'}
        description={
          isZh
            ? '本轮只固定 Admin 信息架构，不提前拆现有菜单业务逻辑。当前完整菜单维护仍保留在旧页面。'
            : 'This foundation pass only fixes the Admin information architecture. The existing combined menu workspace remains available during the transition.'
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
