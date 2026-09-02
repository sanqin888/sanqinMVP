import { join, resolve } from 'node:path';
import {
  formatSourceViolation,
  scanTypeScript,
} from './test/architecture-test.utils';

describe('Uber Eats menu id architecture', () => {
  it('keeps the Admin editor independent from Uber publish node ids', () => {
    const webRoot = resolve(
      __dirname,
      '../../../../web/src/app/[locale]/(site)/admin/(protected)/ubereats',
    );
    const files = scanTypeScript(webRoot, { productionOnly: true });
    const forbidden =
      /\b(?:buildUberNodeId|uberNodeId|sourceStableId|sourceMenuItemStableId|sourceOptionChoiceStableId|sourceTemplateGroupStableId|compositeOptionItemId)\b|sanq:/g;
    const violations = files.flatMap((file) =>
      [...file.source.matchAll(forbidden)].map((match) =>
        formatSourceViolation(webRoot, file, match[0]),
      ),
    );

    expect(violations).toEqual([]);
  });

  it('uses stableId for every Admin menu mutation route parameter', () => {
    const controller = scanTypeScript(join(__dirname, 'api'), {
      productionOnly: true,
    }).find((file) => file.path.endsWith('menu.controller.ts'));
    expect(controller).toBeDefined();

    for (const route of [
      'menu/channel/items/:stableId',
      'menu/channel/options/:stableId',
      'menu/draft/items/:stableId',
      'menu/draft/groups/:stableId',
      'menu/draft/options/:stableId',
      'menu/draft/items/:stableId/restore-source-price',
      'menu/items/:stableId/availability',
      'menu/options/:stableId/availability',
    ]) {
      expect(controller!.source).toContain(route);
    }
    expect(controller!.source).not.toMatch(
      /:(?:itemId|groupId|optionItemId|menuItemStableId|optionChoiceStableId)\b/,
    );
  });

  it('requires explicit store context for store-scoped Admin menu operations', () => {
    const controller = scanTypeScript(join(__dirname, 'api'), {
      productionOnly: true,
    }).find((file) => file.path.endsWith('menu.controller.ts'));
    expect(controller).toBeDefined();
    expect(controller!.source).not.toContain('OptionalResourceIdPipe');
    expect(
      controller!.source.match(
        /@Query\('storeId', ResourceIdPipe\) storeId: string/g,
      ),
    ).toHaveLength(8);

    const roots = [
      join(__dirname, 'application', 'menu'),
      join(__dirname, 'infrastructure', 'persistence'),
    ];
    const forbidden = /\bnormalizeUberStoreId\b|['"]default['"]/g;
    const violations = roots.flatMap((root) =>
      scanTypeScript(root, { productionOnly: true }).flatMap((file) =>
        [...file.source.matchAll(forbidden)].map((match) =>
          formatSourceViolation(__dirname, file, match[0]),
        ),
      ),
    );
    expect(violations).toEqual([]);
  });

  it('uses authenticated userStableId for menu audit operations', () => {
    const controller = scanTypeScript(join(__dirname, 'api'), {
      productionOnly: true,
    }).find((file) => file.path.endsWith('menu.controller.ts'));
    expect(controller).toBeDefined();
    expect(controller!.source).toContain('userStableId');
    expect(controller!.source).not.toMatch(/req\.user(?:!|\?)?\.id\b/);
    expect(controller!.source).not.toMatch(/user\?:\s*{\s*id\?:\s*string/);
  });

  it('keeps graph-id generation out of Admin API and persistence', () => {
    const roots = [
      join(__dirname, 'api'),
      join(__dirname, 'contracts'),
      join(__dirname, 'infrastructure', 'persistence'),
    ];
    const violations = roots.flatMap((root) =>
      scanTypeScript(root, { productionOnly: true }).flatMap((file) =>
        [...file.source.matchAll(/\bbuildUberNodeId\b/g)].map((match) =>
          formatSourceViolation(__dirname, file, match[0]),
        ),
      ),
    );

    expect(violations).toEqual([]);
  });

  it('keeps persistence UUID aliases out of menu application contracts', () => {
    const applicationRoot = join(__dirname, 'application', 'menu');
    const forbidden = /\b(?:attemptId|publishVersionId|administratorId)\b/g;
    const violations = scanTypeScript(applicationRoot, {
      productionOnly: true,
    }).flatMap((file) =>
      [...file.source.matchAll(forbidden)].map((match) =>
        formatSourceViolation(__dirname, file, match[0]),
      ),
    );

    expect(violations).toEqual([]);
  });
});
