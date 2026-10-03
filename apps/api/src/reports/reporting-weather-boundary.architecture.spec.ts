import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPORTS_ROOT = resolve(__dirname);
const API_ROOT = resolve(REPORTS_ROOT, '..');
const REPOSITORY_ROOT = resolve(API_ROOT, '../../..');

function read(path: string): string {
  return readFileSync(path, 'utf8');
}

describe('DATA-B1 Reporting Weather History boundary', () => {
  it('keeps application orchestration on Reporting-owned ports', () => {
    const service = read(resolve(REPORTS_ROOT, 'weather-history.service.ts'));

    expect(service).toContain('REPORTING_STORE_LOCATION_QUERY');
    expect(service).toContain('REPORTING_WEATHER_HISTORY_STORE');
    expect(service).toContain('REPORTING_WEATHER_PROVIDER');
    expect(service).not.toContain('PrismaService');
    expect(service).not.toContain('@prisma/client');
    expect(service).not.toContain('HttpService');
    expect(service).not.toContain('process.env');
    expect(service).not.toContain("from '../store/");
    expect(service).not.toMatch(/\bfetch\s*\(/);
  });

  it('confines provider transport and persistence behind Reporting-owned ports', () => {
    const provider = read(
      resolve(REPORTS_ROOT, 'meteostat-weather.provider.ts'),
    );
    const persistence = read(resolve(REPORTS_ROOT, 'weather-history.store.ts'));
    const module = read(resolve(REPORTS_ROOT, 'reports.module.ts'));

    expect(provider).toContain('HttpService');
    expect(provider).toContain('METEOSTAT_RAPIDAPI_KEY');
    expect(provider).toContain('/point/hourly');
    expect(provider).not.toContain('PrismaService');

    expect(persistence).toContain('REPORTING_WEATHER_DB');
    expect(persistence).not.toContain('PrismaService');
    expect(persistence).not.toContain('@prisma/client');
    expect(persistence).not.toContain('HttpService');
    expect(persistence).not.toContain("from '../store/");

    expect(module).toContain('PrismaService');
    expect(module).toContain('REPORTING_WEATHER_DB');
    expect(module).toContain('reportingWeatherDailyFact');
  });

  it('uses stable Store identity and an additive Reporting-owned weather table', () => {
    const schema = read(resolve(API_ROOT, '../prisma/schema.prisma'));

    expect(schema).toContain('model ReportingWeatherDailyFact');
    expect(schema).toContain('storeStableId');
    expect(schema).toContain('localDate');
    expect(schema).toContain('@@id([storeStableId, localDate])');
    expect(schema).not.toContain('weatherStoreId');
  });

  it('exposes additive weather history without coupling it to Business Operations', () => {
    const controller = read(resolve(REPORTS_ROOT, 'reports.controller.ts'));
    const business = read(
      resolve(REPORTS_ROOT, 'business-operations-report.service.ts'),
    );
    const contract = read(resolve(REPORTS_ROOT, 'weather-history.contract.ts'));

    expect(controller).toContain("@Get('weather-history')");
    expect(controller).toContain('WeatherHistoryService');
    expect(business).not.toContain('WeatherHistoryService');
    expect(contract).toContain('Meteostat and its data providers');
    expect(contract).toContain("'CC BY 4.0'");
    expect(contract).toContain('creativecommons.org/licenses/by/4.0');
    expect(contract).toContain('hourly-to-daily');
    expect(contract).toContain('significantCondition');
  });

  it('keeps provider wiring in the excluded Reports composition root', () => {
    const module = read(resolve(REPORTS_ROOT, 'reports.module.ts'));
    const baseline = read(
      resolve(REPOSITORY_ROOT, 'tools/architecture/context-baseline.json'),
    );

    expect(module).toContain('REPORTING_STORE_LOCATION_QUERY');
    expect(module).toContain('BRAND_STORE_CONFIG_READER');
    expect(module).toContain('REPORTING_WEATHER_DB');
    expect(module).toContain('REPORTING_WEATHER_PROVIDER');
    expect(module).toContain('REPORTING_WEATHER_HISTORY_STORE');
    expect(module).toContain('MeteostatWeatherProvider');
    expect(module).toContain('WeatherHistoryStore');
    expect(baseline).toContain('"apps/api/src/reports/reports.module.ts"');
  });
});
