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
});
