import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { getUploadsRootDir } from '../common/utils/uploads-path';
import {
  DEFAULT_HOMEPAGE_CONTENT,
  type HomepageContentDocument,
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

  async getLocaleContent(locale: HomepageLocale): Promise<HomepageLocaleContent> {
    const document = await this.readDocument();
    return document[locale];
  }

  async getDocument(): Promise<HomepageContentDocument> {
    return this.readDocument();
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
        version: 1,
        zh: this.validateAndMerge(DEFAULT_HOMEPAGE_CONTENT.zh, parsed.zh ?? {}),
        en: this.validateAndMerge(DEFAULT_HOMEPAGE_CONTENT.en, parsed.en ?? {}),
      };
    } catch (error) {
      this.logger.error(
        `Invalid homepage content file at ${configPath}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return structuredClone(DEFAULT_HOMEPAGE_CONTENT);
    }
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
        throw new BadRequestException(`${key} must reference an uploaded or bundled image`);
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

  private async writeDocument(document: HomepageContentDocument): Promise<void> {
    const configPath = this.getConfigPath();
    const configDir = path.dirname(configPath);
    await fs.promises.mkdir(configDir, { recursive: true });

    const tempPath = `${configPath}.tmp-${process.pid}-${Date.now()}`;
    const payload = `${JSON.stringify(document, null, 2)}\n`;
    await fs.promises.writeFile(tempPath, payload, 'utf8');
    await fs.promises.rename(tempPath, configPath);
  }
}
