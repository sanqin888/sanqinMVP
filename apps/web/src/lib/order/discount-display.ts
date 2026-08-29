import type { OrderDiscountDisplayEntry } from '@shared/order';
import type { Locale } from '@/lib/i18n/locales';

export function formatOrderDiscountLabel(
  discount: OrderDiscountDisplayEntry,
  locale: Locale,
): string {
  const isZh = locale === 'zh';
  const productName = isZh
    ? (discount.productNameZh ?? discount.productName ?? discount.productNameEn)
    : (discount.productNameEn ?? discount.productName ?? discount.productNameZh);
  const localizedTitle = isZh
    ? (discount.titleZh ?? discount.title ?? discount.titleEn)
    : (discount.titleEn ?? discount.title ?? discount.titleZh);

  if (discount.source === 'DAILY_SPECIAL') {
    const label = isZh ? '每日特价' : 'Daily special';
    return productName ? `${label} · ${productName}` : label;
  }
  if (localizedTitle) return localizedTitle;
  if (discount.source === 'COUPON') return isZh ? '优惠券' : 'Coupon';
  if (discount.source === 'POS_MANUAL_DISCOUNT') {
    return isZh ? '人工折扣' : 'Manual discount';
  }
  if (discount.source === 'AUTOMATIC_PROMOTION') {
    return isZh ? '活动优惠' : 'Promotion';
  }
  return isZh ? '其他优惠' : 'Other discount';
}
