declare module "luxon" {
  export type DateTimeFromIsoOptions = {
    setZone?: boolean;
  };

  export class DateTime {
    static fromISO(iso: string, options?: DateTimeFromIsoOptions): DateTime;

    setZone(zone: string): DateTime;
    setLocale(locale: string): DateTime;
    toFormat(format: string): string;

    readonly isValid: boolean;
  }
}
