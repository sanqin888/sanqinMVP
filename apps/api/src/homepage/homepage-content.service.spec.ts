import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { HomepageContentService } from './homepage-content.service';

describe('HomepageContentService', () => {
  let tempRoot: string;
  let previousUploadRoot: string | undefined;

  beforeEach(async () => {
    previousUploadRoot = process.env.UPLOAD_ROOT;
    tempRoot = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), 'sanq-homepage-'),
    );
    process.env.UPLOAD_ROOT = tempRoot;
  });

  afterEach(async () => {
    if (previousUploadRoot == null) {
      delete process.env.UPLOAD_ROOT;
    } else {
      process.env.UPLOAD_ROOT = previousUploadRoot;
    }
    await fs.promises.rm(tempRoot, { recursive: true, force: true });
  });

  it('returns locale-specific defaults when no persisted config exists', async () => {
    const service = new HomepageContentService();

    const zh = await service.getLocaleContent('zh');
    const en = await service.getLocaleContent('en');

    expect(zh.heroTitle).toBe('西安味，现做更好吃。');
    expect(en.heroTitle).toBe("Xi'an street food, made fresh.");
    expect(zh.heroTitle).not.toContain("Xi'an");
    expect(en.heroTitle).not.toContain('西安');
  });

  it('persists one locale without overwriting the other locale', async () => {
    const service = new HomepageContentService();
    const originalEn = await service.getLocaleContent('en');

    await service.updateLocaleContent('zh', {
      heroTitle: '今天也要吃肉夹馍',
      heroImageUrl: '/uploads/images/hero-zh.webp',
    });

    const zh = await service.getLocaleContent('zh');
    const en = await service.getLocaleContent('en');

    expect(zh.heroTitle).toBe('今天也要吃肉夹馍');
    expect(zh.heroImageUrl).toBe('/uploads/images/hero-zh.webp');
    expect(en).toEqual(originalEn);
  });

  it('rejects image URLs outside managed site assets', async () => {
    const service = new HomepageContentService();

    await expect(
      service.updateLocaleContent('en', {
        heroImageUrl: 'https://example.com/hero.jpg',
      }),
    ).rejects.toThrow(
      'heroImageUrl must reference an uploaded or bundled image',
    );
  });

  it('persists three featured slots without coupling them to one locale', async () => {
    const service = new HomepageContentService();

    await service.updateFeaturedConfig({
      slots: [
        {
          itemStableId: 'item-a',
          badgeZh: '店主推荐',
          badgeEn: 'Owner Pick',
        },
        { itemStableId: null, badgeZh: null, badgeEn: null },
        { itemStableId: 'item-c', badgeZh: '新品上市', badgeEn: 'New' },
      ],
    });

    await expect(service.getFeaturedConfig()).resolves.toEqual({
      slots: [
        {
          itemStableId: 'item-a',
          badgeZh: '店主推荐',
          badgeEn: 'Owner Pick',
        },
        { itemStableId: null, badgeZh: null, badgeEn: null },
        { itemStableId: 'item-c', badgeZh: '新品上市', badgeEn: 'New' },
      ],
    });
  });

  it('rejects assigning the same featured item to two fixed slots', async () => {
    const service = new HomepageContentService();

    await expect(
      service.updateFeaturedConfig({
        slots: [
          { itemStableId: 'item-a', badgeZh: null, badgeEn: null },
          { itemStableId: 'item-a', badgeZh: null, badgeEn: null },
          { itemStableId: null, badgeZh: null, badgeEn: null },
        ],
      }),
    ).rejects.toThrow('the same featured item cannot be assigned twice');
  });
});
