import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { rollChangelog } from '../.github/scripts/changelog-release.mjs';

const REPO = 'https://github.com/prohand/gladys-nissanconnect';

test('the first release moves Unreleased under the version and links its tag', () => {
  const before = `# Changelog\n\n## [Unreleased]\n\n### Added\n\n- First.\n\n[Unreleased]: ${REPO}/commits/main\n`;
  const after = rollChangelog(before, '1.0.0', '2026-11-12');
  assert.match(after, /## \[Unreleased\]\n\n## \[1\.0\.0\] - 2026-11-12\n\n### Added\n\n- First\./);
  assert.match(after, new RegExp(`\\[Unreleased\\]: ${REPO}/compare/v1\\.0\\.0\\.\\.\\.HEAD`));
  assert.match(after, new RegExp(`\\[1\\.0\\.0\\]: ${REPO}/releases/tag/v1\\.0\\.0`));
});

test('an empty Unreleased still gets a version heading', () => {
  const before = `## [Unreleased]\n\n## [1.0.0] - 2026-11-12\n\n- x\n\n[Unreleased]: ${REPO}/compare/v1.0.0...HEAD\n`;
  const after = rollChangelog(before, '1.0.1', '2026-11-13');
  assert.match(after, /## \[1\.0\.1\] - 2026-11-13\n\n- Maintenance release/);
  assert.match(after, new RegExp(`\\[1\\.0\\.1\\]: ${REPO}/compare/v1\\.0\\.0\\.\\.\\.v1\\.0\\.1`));
});

test('the real CHANGELOG.md can be rolled', async () => {
  const text = await readFile(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
  assert.match(text, /^## \[Unreleased\]$/m);
  assert.notEqual(rollChangelog(text, '9.9.9', '2026-11-12'), text);
});
