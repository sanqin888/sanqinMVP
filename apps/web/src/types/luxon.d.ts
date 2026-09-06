declare module "luxon" {
  export type DateTimeFromIsoOptions = {
    setZone?: boolean;
    zone?: string;
  };

  export class DateTime {
    static fromISO(iso: string, options?: DateTimeFromIsoOptions): DateTime;

    setZone(zone: string): DateTime;
    setLocale(locale: string): DateTime;
    startOf(unit: "day"): DateTime;
    plus(duration: { days: number }): DateTime;
    toUTC(): DateTime;
    toISO(): string | null;
    toFormat(format: string): string;

    readonly isValid: boolean;
  }
}
