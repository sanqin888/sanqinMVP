import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { getUploadsRootDir } from '../common/utils/uploads-path';
import {
  DEFAULT_HOMEPAGE_CONTENT,
  type HomepageContentDocument,
  type HomepageFeaturedConfig,
  type HomepageFeaturedSlotConfig,
  type HomepageLocale,
  type HomepageLocaleContent,
} from './homepage-content.types';

const TEXT_FIELDS = [
  'heroEyebrow',
  'heroTitle',
  'heroDescription',
  'heroPrimaryCtaLabel',
  'heroSecondaryCtaLabel',
  'dailySpecialTitle',
  'dailySpecialDescription',
  'favoritesEyebrow',
  'favoritesTitle',
  'membershipEyebrow',
  'membershipTitle',
  'membershipDescription',
  'membershipCtaLabel',
] as const;

type TextField = (typeof TEXT_FIELDS)[number];

const TEXT_LIMITS: Record<TextField, number> = {
  heroEyebrow: 120,
  heroTitle: 160,
  heroDescription: 500,
  heroPrimaryCtaLabel: 60,
  heroSecondaryCtaLabel: 60,
  dailySpecialTitle: 120,
  dailySpecialDescription: 500,
  favoritesEyebrow: 120,
  favoritesTitle: 120,
  membershipEyebrow: 120,
  membershipTitle: 160,
  membershipDescription: 500,
  membershipCtaLabel: 60,
};

const IMAGE_FIELDS = [
  'heroImageUrl',
  'heroMobileImageUrl',
  'membershipImageUrl',
] as const;

@Injectable()
export class HomepageContentService {
  private readonly logger = new Logger(HomepageContentService.name);
  private writeQueue: Promise<void> = Promise.resolve();

  async getLocaleContent(
    locale: HomepageLocale,
  ): Promise<HomepageLocaleContent> {
    const document = await this.readDocument();
    return document[locale];
  }

  async getDocument(): Promise<HomepageContentDocument> {
    return this.readDocument();
  }

  async getFeaturedConfig(): Promise<HomepageFeaturedConfig> {
    const document = await this.readDocument();
    return document.featured;
  }

  async updateFeaturedConfig(
    input: HomepageFeaturedConfig,
  ): Promise<HomepageFeaturedConfig> {
    const operation = this.writeQueue.then(async () => {
      const current = await this.readDocument();
      const featured = this.validateFeaturedConfig(input);
      const nextDocument: HomepageContentDocument = {
        ...current,
        featured,
      };
      await this.writeDocument(nextDocument);
      return featured;
    });

    this.writeQueue = operation.then(
      () => undefined,
      (error: unknown) => {
        this.logger.error(
          `Homepage featured config write failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      },
    );

    return operation;
  }

  async updateLocaleContent(
    locale: HomepageLocale,
    input: Partial<HomepageLocaleContent>,
  ): Promise<HomepageLocaleContent> {
    const operation = this.writeQueue.then(async () => {
      const current = await this.readDocument();
      const nextLocale = this.validateAndMerge(current[locale], input);
      const nextDocument: HomepageContentDocument = {
        ...current,
        [locale]: nextLocale,
      };
      await this.writeDocument(nextDocument);
      return nextLocale;
    });

    this.writeQueue = operation.then(
      () => undefined,
      (error: unknown) => {
        this.logger.error(
          `Homepage content write failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      },
    );

    return operation;
  }

  private getConfigPath(): string {
    return path.join(getUploadsRootDir(), 'site', 'homepage-content.json');
  }

  private async readDocument(): Promise<HomepageContentDocument> {
    const configPath = this.getConfigPath();
    let raw: string;
    try {
      raw = await fs.promises.readFile(configPath, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return structuredClone(DEFAULT_HOMEPAGE_CONTENT);
      }
      throw error;
    }

    try {
      const parsed = JSON.parse(raw) as Partial<HomepageContentDocument>;
      return {
        version: 2,
        zh: this.validateAndMerge(DEFAULT_HOMEPAGE_CONTENT.zh, parsed.zh ?? {}),
        en: this.validateAndMerge(DEFAULT_HOMEPAGE_CONTENT.en, parsed.en ?? {}),
        featured: this.validateFeaturedConfig(
          parsed.featured ?? DEFAULT_HOMEPAGE_CONTENT.featured,
        ),
      };
    } catch (error) {
      this.logger.error(
        `Invalid homepage content file at ${configPath}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return structuredClone(DEFAULT_HOMEPAGE_CONTENT);
    }
  }

  private validateFeaturedConfig(
    input: HomepageFeaturedConfig,
  ): HomepageFeaturedConfig {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new BadRequestException(
        'homepage featured config must be an object',
      );
    }
    if (!Array.isArray(input.slots) || input.slots.length !== 3) {
      throw new BadRequestException(
        'homepage featured config must contain exactly 3 slots',
      );
    }

    const seenStableIds = new Set<string>();
    const normalizeSlot = (
      slot: HomepageFeaturedSlotConfig,
      index: number,
    ): HomepageFeaturedSlotConfig => {
      if (!slot || typeof slot !== 'object' || Array.isArray(slot)) {
        throw new BadRequestException(
          `featured slot ${index + 1} must be an object`,
        );
      }

      const itemStableId =
        typeof slot.itemStableId === 'string'
          ? slot.itemStableId.trim()
          : null;
      if (itemStableId && itemStableId.length > 200) {
        throw new BadRequestException(
          `featured slot ${index + 1} itemStableId is too long`,
        );
      }
      if (itemStableId && seenStableIds.has(itemStableId)) {
        throw new BadRequestException(
          'the same featured item cannot be assigned twice',
        );
      }
      if (itemStableId) seenStableIds.add(itemStableId);

      const normalizeBadge = (value: string | null, field: string) => {
        if (value !== null && typeof value !== 'string') {
          throw new BadRequestException(`${field} must be a string or null`);
        }
        const normalized = typeof value === 'string' ? value.trim() : '';
        if (normalized.length > 32) {
          throw new BadRequestException(`${field} exceeds 32 characters`);
        }
        return normalized || null;
      };

      return {
        itemStableId: itemStableId || null,
        badgeZh: normalizeBadge(
          slot.badgeZh,
          `featured slot ${index + 1} badgeZh`,
        ),
        badgeEn: normalizeBadge(
          slot.badgeEn,
          `featured slot ${index + 1} badgeEn`,
        ),
      };
    };

    const slots = input.slots.map(
      normalizeSlot,
    ) as HomepageFeaturedConfig['slots'];
    return { slots };
  }

  private validateAndMerge(
    base: HomepageLocaleContent,
    input: Partial<HomepageLocaleContent>,
  ): HomepageLocaleContent {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new BadRequestException('homepage content must be an object');
    }

    const next = { ...base };

    for (const key of TEXT_FIELDS) {
      if (!(key in input)) continue;
      const value = input[key];
      if (typeof value !== 'string') {
        throw new BadRequestException(`${key} must be a string`);
      }
      const normalized = value.trim();
      if (!normalized) {
        throw new BadRequestException(`${key} cannot be empty`);
      }
      const limit = TEXT_LIMITS[key];
      if (normalized.length > limit) {
        throw new BadRequestException(`${key} exceeds ${limit} characters`);
      }
      next[key] = normalized;
    }

    for (const key of IMAGE_FIELDS) {
      if (!(key in input)) continue;
      const value = input[key];
      if (value !== null && typeof value !== 'string') {
        throw new BadRequestException(`${key} must be a string or null`);
      }
      const normalized = typeof value === 'string' ? value.trim() : null;
      if (normalized && !this.isAllowedImageUrl(normalized)) {
        throw new BadRequestException(
          `${key} must reference an uploaded or bundled image`,
        );
      }
      next[key] = normalized || null;
    }

    return next;
  }

  private isAllowedImageUrl(value: string): boolean {
    if (value.startsWith('/uploads/images/')) return true;
    if (value.startsWith('/images/')) return true;
    return false;
  }

  private async writeDocument(
    document: HomepageContentDocument,
  ): Promise<void> {
    const configPath = this.getConfigPath();
    const configDir = path.dirname(configPath);
    await fs.promises.mkdir(configDir, { recursive: true });

    const tempPath = `${configPath}.tmp-${process.pid}-${Date.now()}`;
    const payload = `${JSON.stringify(document, null, 2)}\n`;
    await fs.promises.writeFile(tempPath, payload, 'utf8');
    await fs.promises.rename(tempPath, configPath);
  }
}
