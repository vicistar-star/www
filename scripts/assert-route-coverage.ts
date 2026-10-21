/**
 * Build-time assertion: every route registered in App.tsx must have an explicit
 * quality-check policy in src/routes/inventory.ts.
 *
 * Run as part of `pnpm build` (via scripts/validate-content.ts, which imports
 * this) so that adding a route to the router without a policy entry is a
 * build error, not a silent omission.
 *
 * Strategy: parse the static path strings out of App.tsx with a regex rather
 * than importing the module (which would require a full React environment) and
 * compare them against the inventory.
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  STATIC_ROUTES,
  DYNAMIC_ROUTE_FAMILIES,
  SPECIAL_ROUTES,
} from '../src/routes/inventory.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const appPath = join(rootDir, 'src', 'App.tsx');

/**
 * Extract all `path="..."` values from App.tsx.
 * We only look at literal string paths — locale-prefixed variants built from
 * template literals (e.g. `/${locale}/stellar`) are omitted because the
 * localized flag on each inventory entry already captures them.
 */
function extractAppPaths(source: string): Set<string> {
  const paths = new Set<string>();

  // Match path="<literal>" attributes (single or double quotes)
  const literalPattern = /\bpath=["']([^"'*]+?)["']/g;
  let m: RegExpExecArray | null;
  while ((m = literalPattern.exec(source)) !== null) {
    paths.add(m[1]);
  }

  // Capture the catch-all wildcard separately
  if (/\bpath=["']\*["']/.test(source)) {
    paths.add('*');
  }

  // Remove locale-prefixed duplicates (/es/..., /pt/...) — they are covered by
  // the `localized` flag on the base path entry.
  for (const p of Array.from(paths)) {
    if (/^\/(es|pt)(\/|$)/.test(p)) {
      paths.delete(p);
    }
  }

  return paths;
}

export function assertAllAppRoutesHavePolicy(): void {
  const source = readFileSync(appPath, 'utf8');
  const appPaths = extractAppPaths(source);

  // Build a set of all paths/patterns declared in the inventory
  const inventoryPatterns = new Set<string>([
    ...STATIC_ROUTES.map((r) => r.path),
    ...DYNAMIC_ROUTE_FAMILIES.map((f) => f.pattern),
    ...SPECIAL_ROUTES.map((r) => r.pattern),
  ]);

  const missing: string[] = [];
  for (const appPath of appPaths) {
    if (!inventoryPatterns.has(appPath)) {
      missing.push(appPath);
    }
  }

  if (missing.length > 0) {
    const list = missing.map((p) => `  • ${p}`).join('\n');
    throw new Error(
      `Route inventory is out of date.\n` +
        `The following routes exist in App.tsx but have no policy in src/routes/inventory.ts:\n` +
        `${list}\n\n` +
        `Add each missing route to STATIC_ROUTES, DYNAMIC_ROUTE_FAMILIES, or SPECIAL_ROUTES ` +
        `in src/routes/inventory.ts and set its quality-check policy.`,
    );
  }
}
