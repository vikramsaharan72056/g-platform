import fs from 'node:fs';
import path from 'node:path';

const INPUT_FILE = path.resolve('tests/playwright/results/results.json');
const OUTPUT_FILE = path.resolve('docs/09-E2E-FUNCTIONAL-REPORT.md');

function ensureFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Required file not found: ${filePath}`);
  }
}

function normalizeStatusFromResults(results = []) {
  if (!Array.isArray(results) || results.length === 0) return 'unknown';
  const statuses = results.map((r) => r.status).filter(Boolean);
  if (statuses.some((s) => s === 'failed' || s === 'timedOut')) return 'failed';
  if (statuses.some((s) => s === 'interrupted')) return 'interrupted';
  if (statuses.every((s) => s === 'skipped')) return 'skipped';
  if (statuses.some((s) => s === 'passed')) return 'passed';
  return statuses[0] || 'unknown';
}

function walkNode(node, parentTitles = [], collected = []) {
  if (!node || typeof node !== 'object') return collected;

  const nextTitles =
    node.title && node.title.trim().length > 0 ? [...parentTitles, node.title] : parentTitles;

  if (Array.isArray(node.specs)) {
    for (const spec of node.specs) {
      const specTitles =
        spec.title && spec.title.trim().length > 0
          ? [...nextTitles, spec.title]
          : [...nextTitles];

      if (Array.isArray(spec.tests)) {
        for (const test of spec.tests) {
          const title =
            test.title && test.title.trim().length > 0
              ? [...specTitles, test.title].join(' > ')
              : specTitles.join(' > ');
          const project =
            test.projectName ||
            test.results?.[0]?.projectName ||
            test.location?.file ||
            'unknown';
          const status = normalizeStatusFromResults(test.results);
          const durationMs = Array.isArray(test.results)
            ? test.results.reduce((sum, r) => sum + (r.duration || 0), 0)
            : 0;
          const firstError = test.results?.find((r) => Array.isArray(r.errors) && r.errors.length)
            ?.errors?.[0];

          collected.push({
            title,
            project,
            status,
            durationMs,
            error: firstError?.message || null,
          });
        }
      }
    }
  }

  const childKeys = ['suites', 'suite', 'children'];
  for (const key of childKeys) {
    if (Array.isArray(node[key])) {
      for (const child of node[key]) {
        walkNode(child, nextTitles, collected);
      }
    }
  }

  return collected;
}

function bucketByProject(tests) {
  const map = new Map();
  for (const t of tests) {
    const current = map.get(t.project) || {
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      interrupted: 0,
      unknown: 0,
    };
    current.total += 1;
    if (t.status === 'passed') current.passed += 1;
    else if (t.status === 'failed') current.failed += 1;
    else if (t.status === 'skipped') current.skipped += 1;
    else if (t.status === 'interrupted') current.interrupted += 1;
    else current.unknown += 1;
    map.set(t.project, current);
  }
  return map;
}

function buildReport(tests, stats) {
  const now = new Date().toISOString();
  const total = tests.length;
  const passed = tests.filter((t) => t.status === 'passed').length;
  const failed = tests.filter((t) => t.status === 'failed').length;
  const skipped = tests.filter((t) => t.status === 'skipped').length;
  const interrupted = tests.filter((t) => t.status === 'interrupted').length;
  const unknown = tests.filter((t) => t.status === 'unknown').length;
  const projectBuckets = bucketByProject(tests);

  const lines = [];
  lines.push('# E2E Functional Report (Playwright)');
  lines.push('');
  lines.push(`Generated: ${now}`);
  lines.push('');
  lines.push('## Functional Summary');
  lines.push(`- Total checks: ${total}`);
  lines.push(`- Passed: ${passed}`);
  lines.push(`- Failed: ${failed}`);
  lines.push(`- Skipped: ${skipped}`);
  lines.push(`- Interrupted: ${interrupted}`);
  lines.push(`- Unknown: ${unknown}`);
  if (stats?.duration) {
    lines.push(`- Total duration: ${(stats.duration / 1000).toFixed(1)}s`);
  }
  lines.push('');
  lines.push('## Project Breakdown');
  for (const [project, bucket] of projectBuckets.entries()) {
    lines.push(
      `- ${project}: ${bucket.passed}/${bucket.total} passed, ${bucket.failed} failed, ${bucket.skipped} skipped`,
    );
  }
  lines.push('');

  const failedTests = tests.filter((t) => t.status === 'failed');
  lines.push('## Failed Functional Points');
  if (failedTests.length === 0) {
    lines.push('- None');
  } else {
    for (const t of failedTests) {
      lines.push(`- [${t.project}] ${t.title}`);
      if (t.error) {
        lines.push(`  - Error: ${t.error.replace(/\s+/g, ' ').trim()}`);
      }
    }
  }
  lines.push('');

  const passedTests = tests.filter((t) => t.status === 'passed');
  lines.push('## Passed Functional Points');
  if (passedTests.length === 0) {
    lines.push('- None');
  } else {
    for (const t of passedTests) {
      lines.push(`- [${t.project}] ${t.title} (${(t.durationMs / 1000).toFixed(1)}s)`);
    }
  }
  lines.push('');

  return lines.join('\n');
}

function main() {
  ensureFile(INPUT_FILE);
  const raw = fs.readFileSync(INPUT_FILE, 'utf8');
  const parsed = JSON.parse(raw);
  const tests = walkNode(parsed, [], []);
  const report = buildReport(tests, parsed.stats || {});

  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, report, 'utf8');

  process.stdout.write(`Functional report written: ${OUTPUT_FILE}\n`);
}

main();

