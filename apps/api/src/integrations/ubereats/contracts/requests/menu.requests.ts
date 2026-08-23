import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsInt,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { UBER_RESOURCE_ID_PATTERN } from '../uber-resource-id';

export class UpsertUberPriceBookItemDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000000)
  priceCents!: number;

  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;

  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsString()
  displayDescription?: string;

  @IsOptional()
  @IsIn(['PREPARED', 'PREPACKAGED'])
  preparationType?: 'PREPARED' | 'PREPACKAGED';
}

export class UpsertUberOptionItemConfigDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  priceDeltaCents?: number;

  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;

  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsString()
  displayDescription?: string;

  @IsOptional()
  @IsIn(['PREPARED', 'PREPACKAGED'])
  preparationType?: 'PREPARED' | 'PREPACKAGED';
}

export class UpdateUberDraftItemDto {
  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsString()
  displayDescription?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000000)
  priceCents?: number;

  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;

  @IsOptional()
  @IsIn(['PREPARED', 'PREPACKAGED'])
  preparationType?: 'PREPARED' | 'PREPACKAGED';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  @Matches(UBER_RESOURCE_ID_PATTERN)
  storeId?: string;
}

export class UpdateUberDraftGroupDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minSelect?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxSelect?: number;

  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  @Matches(UBER_RESOURCE_ID_PATTERN)
  storeId?: string;
}

export class UpdateUberDraftOptionDto {
  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  priceDeltaCents?: number;

  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;

  @IsOptional()
  @IsIn(['PREPARED', 'PREPACKAGED'])
  preparationType?: 'PREPARED' | 'PREPACKAGED';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  @Matches(UBER_RESOURCE_ID_PATTERN)
  storeId?: string;
}

export class PublishUberMenuDto {
  /** Internal/POS store id and cloud print-task room id; never an Uber store id. */
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  @Matches(UBER_RESOURCE_ID_PATTERN)
  storeId?: string;

  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;

  @IsOptional()
  @IsBoolean()
  timezoneConfirmed?: boolean;

  @IsOptional()
  @IsBoolean()
  taxRateConfirmed?: boolean;

  @IsOptional()
  @IsString()
  @Matches(/^[a-f0-9]{64}$/)
  safetyFingerprint?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsString({ each: true })
  excludedCategoryIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsString({ each: true })
  excludedGroupIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsString({ each: true })
  excludedMenuItemStableIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsString({ each: true })
  excludedOptionChoiceStableIds?: string[];
}

export class UberMenuConfigImportDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  @Matches(UBER_RESOURCE_ID_PATTERN)
  sourceStoreId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  @Matches(UBER_RESOURCE_ID_PATTERN)
  targetStoreId!: string;

  @IsOptional()
  @IsString()
  @IsIn(['SKIP_EXISTING', 'OVERWRITE'])
  mode?: 'SKIP_EXISTING' | 'OVERWRITE';

  @IsOptional()
  @IsString()
  @Matches(/^[a-f0-9]{64}$/)
  previewFingerprint?: string;
}

export class SyncUberMenuItemAvailabilityDto {
  @IsBoolean()
  isAvailable!: boolean;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  @Matches(UBER_RESOURCE_ID_PATTERN)
  storeId?: string;
}

export class SyncUberOptionItemAvailabilityDto {
  @IsBoolean()
  isAvailable!: boolean;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  @Matches(UBER_RESOURCE_ID_PATTERN)
  storeId?: string;
}
