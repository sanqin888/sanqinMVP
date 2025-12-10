// apps/api/src/business-hours/dto/business-hours.dto.ts

// 0 = Sunday ... 6 = Saturday
export type WeekdayNumber = 0 | 1 | 2 | 3 | 4 | 5 | 6;

// 对应数据库里的 BusinessHour：weekday + open/closeMinutes + isClosed
export type BusinessHourDto = {
  weekday: WeekdayNumber; // 0-6
  openMinutes: number | null; // 休息日可以是 null
  closeMinutes: number | null; // 休息日可以是 null
  isClosed: boolean;
};

// GET /admin/business/hours 返回结构
export type BusinessHoursResponse = {
  hours: BusinessHourDto[];
};

// PUT /admin/business/hours 提交结构（简单复用）
export type UpdateBusinessHoursDto = BusinessHoursResponse;
