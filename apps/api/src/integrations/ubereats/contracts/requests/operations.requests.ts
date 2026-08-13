import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsDefined,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  Validate,
  ValidateIf,
  ValidateNested,
  ValidatorConstraint,
  ValidationArguments,
  ValidatorConstraintInterface,
} from 'class-validator';
import { PublishUberMenuDto } from './menu.requests';
import { OrderStatus } from './orders.requests';
import { UBER_RESOURCE_ID_PATTERN } from '../uber-resource-id';

export const UberOpsTicketType = {
  ORDER_STATUS_SYNC: 'ORDER_STATUS_SYNC',
  MENU_ITEM_AVAILABILITY: 'MENU_ITEM_AVAILABILITY',
  STORE_STATUS_SYNC: 'STORE_STATUS_SYNC',
  MENU_PUBLISH: 'MENU_PUBLISH',
  RECONCILIATION: 'RECONCILIATION',
} as const;
export type UberOpsTicketType =
  (typeof UberOpsTicketType)[keyof typeof UberOpsTicketType];

export const UberOpsTicketStatus = {
  OPEN: 'OPEN',
  IN_PROGRESS: 'IN_PROGRESS',
  RESOLVED: 'RESOLVED',
  CLOSED: 'CLOSED',
  IGNORED: 'IGNORED',
} as const;
export type UberOpsTicketStatus =
  (typeof UberOpsTicketStatus)[keyof typeof UberOpsTicketStatus];

export const UberOpsTicketPriority = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL',
} as const;
export type UberOpsTicketPriority =
  (typeof UberOpsTicketPriority)[keyof typeof UberOpsTicketPriority];

export class StoreIdQuery {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  @Matches(UBER_RESOURCE_ID_PATTERN)
  storeId?: string;
}
export class ReportListQuery extends StoreIdQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}
export class OpsTicketListQuery extends StoreIdQuery {
  @IsOptional()
  @IsEnum(UberOpsTicketStatus)
  status?: UberOpsTicketStatus;
}

@ValidatorConstraint({ name: 'dateRange', async: false })
class DateRangeConstraint implements ValidatorConstraintInterface {
  validate(_: unknown, args: ValidationArguments) {
    const { rangeStart, rangeEnd } =
      args.object as GenerateUberReconciliationReportDto;
    if (!rangeStart && !rangeEnd) return true;
    if (!rangeStart || !rangeEnd) return false;
    const start = Date.parse(rangeStart);
    const end = Date.parse(rangeEnd);
    return (
      Number.isFinite(start) &&
      Number.isFinite(end) &&
      start <= end &&
      end - start <= 31 * 86400000
    );
  }
  defaultMessage() {
    return 'rangeStart/rangeEnd 必须同时提供、起止有序且跨度不超过 31 天';
  }
}

export class GenerateUberReconciliationReportDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  @Matches(UBER_RESOURCE_ID_PATTERN)
  storeId?: string;

  @IsOptional()
  @IsDateString()
  @Validate(DateRangeConstraint)
  rangeStart?: string;

  @IsOptional()
  @IsDateString()
  rangeEnd?: string;
}

@ValidatorConstraint({ name: 'ticketContext', async: false })
class TicketContextConstraint implements ValidatorConstraintInterface {
  validate(_: unknown, args: ValidationArguments): boolean {
    const dto = args.object as CreateUberOpsTicketDto;
    switch (dto.type) {
      case UberOpsTicketType.ORDER_STATUS_SYNC:
        return Boolean(dto.externalOrderId && dto.targetOrderStatus);
      case UberOpsTicketType.MENU_ITEM_AVAILABILITY:
        return (
          Boolean(dto.menuItemStableId) && typeof dto.isAvailable === 'boolean'
        );
      case UberOpsTicketType.STORE_STATUS_SYNC:
        return Boolean(dto.uberStoreId && dto.targetStoreStatus);
      case UberOpsTicketType.MENU_PUBLISH:
        return Boolean(dto.publish || dto.storeId);
      default:
        return false;
    }
  }

  defaultMessage(): string {
    return '工单 context 与 type 不匹配或缺少该类型的必需字段';
  }
}

export class CreateUberOpsTicketDto {
  @IsEnum(UberOpsTicketType)
  @Validate(TicketContextConstraint)
  type!: UberOpsTicketType;

  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(UberOpsTicketPriority)
  priority?: UberOpsTicketPriority;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  @Matches(UBER_RESOURCE_ID_PATTERN)
  storeId?: string;

  @ValidateIf(
    (dto: CreateUberOpsTicketDto) =>
      dto.type === UberOpsTicketType.ORDER_STATUS_SYNC,
  )
  @IsDefined()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  @Matches(UBER_RESOURCE_ID_PATTERN)
  externalOrderId?: string;

  @ValidateIf(
    (dto: CreateUberOpsTicketDto) =>
      dto.type === UberOpsTicketType.MENU_ITEM_AVAILABILITY,
  )
  @IsDefined()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  @Matches(UBER_RESOURCE_ID_PATTERN)
  menuItemStableId?: string;

  @ValidateIf(
    (dto: CreateUberOpsTicketDto) =>
      dto.type === UberOpsTicketType.ORDER_STATUS_SYNC,
  )
  @IsDefined()
  @IsEnum(OrderStatus)
  targetOrderStatus?: OrderStatus;

  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;

  @IsOptional()
  @IsIn(['ONLINE', 'PAUSED'])
  targetStoreStatus?: 'ONLINE' | 'PAUSED';

  @IsOptional()
  @IsString()
  uberStoreId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => PublishUberMenuDto)
  publish?: PublishUberMenuDto;
}
