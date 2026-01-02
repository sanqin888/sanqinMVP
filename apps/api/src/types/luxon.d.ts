declare module 'luxon' {
  export type DateTimeToIsoOptions = {
    includeOffset?: boolean;
    suppressMilliseconds?: boolean;
  };

  export type DateTimeFromJsDateOptions = {
    zone?: string;
  };

  export class DateTime {
    static now(): DateTime;
    static fromJSDate(
      date: Date,
      options?: DateTimeFromJsDateOptions,
    ): DateTime;

    setZone(zone: string): DateTime;
    toFormat(format: string): string;
    startOf(unit: 'day'): DateTime;
    plus(duration: { minutes?: number }): DateTime;
    toUTC(): DateTime;
    toISO(options?: DateTimeToIsoOptions): string | null;

    readonly isValid: boolean;
    readonly invalidReason: string | null;
    readonly weekday: number;
    readonly hour: number;
    readonly minute: number;
  }
}
