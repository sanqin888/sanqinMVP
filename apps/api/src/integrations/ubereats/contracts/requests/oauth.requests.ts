import {
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { UBER_RESOURCE_ID_PATTERN } from '../uber-resource-id';

export class MerchantQuery {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  @Matches(UBER_RESOURCE_ID_PATTERN)
  connectionId?: string;
}

export class OAuthCallbackQuery {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(2048) code?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(512) state?: string;
  /** OAuth error values are accepted only as control data and must never be rendered/logged. */
  @IsOptional() @IsString() @MinLength(1) @MaxLength(128) error?: string;
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(1024)
  error_description?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(2048) error_uri?: string;
}

export class ProvisionUberStoreDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  @Matches(UBER_RESOURCE_ID_PATTERN)
  storeId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  @Matches(UBER_RESOURCE_ID_PATTERN)
  connectionId!: string;

  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;
}

export class StoreIntegrationQuery {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  @Matches(UBER_RESOURCE_ID_PATTERN)
  connectionId!: string;
}

export class UpdateUberStoreIntegrationDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  @Matches(UBER_RESOURCE_ID_PATTERN)
  connectionId!: string;

  @IsObject()
  payload!: Record<string, unknown>;
}

export class SelectUberStoreDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  @Matches(UBER_RESOURCE_ID_PATTERN)
  connectionId!: string;
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  @Matches(UBER_RESOURCE_ID_PATTERN)
  storeId!: string;
  @IsOptional() @IsString() @MaxLength(256) storeName?: string;
  @IsOptional() @IsString() @MaxLength(512) locationSummary?: string;
  @IsOptional()
  @IsString()
  @MaxLength(128)
  @Matches(UBER_RESOURCE_ID_PATTERN)
  reconnectFromConnectionId?: string;
}

export class UpdatePosExternalStoreIdDto {
  @IsString()
  @MaxLength(128)
  @Matches(/^[A-Za-z0-9_-]+$/, {
    message: 'posExternalStoreId 只能包含字母、数字、下划线和连字符',
  })
  posExternalStoreId!: string;
}
