import type { Locale } from '@/lib/i18n/locales';

export type HomepageFeaturedSlotConfig = {
  itemStableId: string | null;
  badgeZh: string | null;
  badgeEn: string | null;
};

export type HomepageFeaturedConfig = {
  slots: [HomepageFeaturedSlotConfig, HomepageFeaturedSlotConfig, HomepageFeaturedSlotConfig];
};

export type HomepageFeaturedItem = {
  itemStableId: string;
  badge: string | null;
};

export type HomepageContent = {
  heroEyebrow: string;
  heroTitle: string;
  heroDescription: string;
  heroPrimaryCtaLabel: string;
  heroSecondaryCtaLabel: string;
  heroImageUrl: string | null;
  heroMobileImageUrl: string | null;
  dailySpecialTitle: string;
  dailySpecialDescription: string;
  favoritesEyebrow: string;
  favoritesTitle: string;
  membershipEyebrow: string;
  membershipTitle: string;
  membershipDescription: string;
  membershipCtaLabel: string;
  membershipImageUrl: string | null;
};

const DEFAULTS: Record<Locale, HomepageContent> = {
  zh: {
    heroEyebrow: '三秦 · 西安街头味',
    heroTitle: '西安味，现做更好吃。',
    heroDescription: '肉夹馍、凉皮和西安面食，在北约克新鲜现做。',
    heroPrimaryCtaLabel: '开始点单',
    heroSecondaryCtaLabel: '查看今日特价',
    heroImageUrl: null,
    heroMobileImageUrl: null,
    dailySpecialTitle: '今日特价',
    dailySpecialDescription: '每天一款店内人气餐品，网站下单即可享受当日特价。',
    favoritesEyebrow: '第一次来？从这里开始',
    favoritesTitle: '三秦招牌推荐',
    membershipEyebrow: '三秦会员',
    membershipTitle: '加入会员，吃得越多福利越多',
    membershipDescription: '累积积分、领取会员优惠券，并享受不定期会员专享活动。',
    membershipCtaLabel: '免费注册会员',
    membershipImageUrl: null,
  },
  en: {
    heroEyebrow: "SANQ · XI'AN STREET FOOD",
    heroTitle: "Xi'an street food, made fresh.",
    heroDescription: "Roujiamo, Liangpi and Xi'an-style noodles made fresh in North York.",
    heroPrimaryCtaLabel: 'Order Now',
    heroSecondaryCtaLabel: "Today's Special",
    heroImageUrl: null,
    heroMobileImageUrl: null,
    dailySpecialTitle: "Today's Special",
    dailySpecialDescription: 'A different SanQ favorite every day, specially priced when you order online.',
    favoritesEyebrow: 'FIRST TIME HERE? START WITH THESE',
    favoritesTitle: 'SanQ Favorites',
    membershipEyebrow: 'SANQ MEMBERS',
    membershipTitle: 'Join SanQ and enjoy more',
    membershipDescription: 'Earn points, receive member coupons and unlock occasional member-only offers.',
    membershipCtaLabel: 'Join SanQ',
    membershipImageUrl: null,
  },
};

export function getDefaultHomepageContent(locale: Locale): HomepageContent {
  return { ...DEFAULTS[locale] };
}

export function getDefaultHomepageFeaturedConfig(): HomepageFeaturedConfig {
  return {
    slots: [
      { itemStableId: null, badgeZh: null, badgeEn: null },
      { itemStableId: null, badgeZh: null, badgeEn: null },
      { itemStableId: null, badgeZh: null, badgeEn: null },
    ],
  };
}
