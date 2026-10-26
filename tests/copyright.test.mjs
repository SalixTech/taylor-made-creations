import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const compiled = ts.transpileModule(readFileSync(new URL('../src/content/copyright.ts', import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const copyright = {};
new Function('exports', compiled)(copyright);

test('copyright waits until January 1 at 12:01 a.m. Eastern, including the first minute after midnight', () => {
  for (const instant of ['2026-12-31T23:59:59.999Z', '2027-01-01T04:59:59.999Z', '2027-01-01T05:00:00.000Z', '2027-01-01T05:00:59.999Z']) assert.equal(copyright.copyrightYearAt(new Date(instant)), 2026, instant);
  for (const instant of ['2027-01-01T05:01:00.000Z', '2027-01-01T05:01:00.001Z', '2027-06-01T04:00:00.000Z', '2027-12-31T23:59:59.999Z']) assert.equal(copyright.copyrightYearAt(new Date(instant)), 2027, instant);
});
test('year rollover and the following timer remain correct in leap years and later years', () => {
  for (const year of [2027, 2028, 2029, 2030, 2100]) {
    const cutoff = Date.UTC(year, 0, 1, 5, 1);
    assert.equal(copyright.copyrightRolloverAt(year), cutoff);
    assert.equal(copyright.copyrightYearAt(cutoff - 1), year - 1);
    assert.equal(copyright.copyrightYearAt(cutoff), year);
    assert.equal(copyright.nextCopyrightRolloverAt(cutoff - 1), cutoff);
    assert.equal(copyright.nextCopyrightRolloverAt(cutoff), Date.UTC(year + 1, 0, 1, 5, 1));
  }
});
test('long browser timers are clamped and the boundary is scheduled to the millisecond', () => {
  assert.equal(copyright.copyrightRefreshDelay(new Date('2027-01-01T05:00:59.000Z')), 1000);
  assert.equal(copyright.copyrightRefreshDelay(new Date('2027-01-01T05:00:59.999Z')), 1);
  assert.equal(copyright.copyrightRefreshDelay(new Date('2026-10-25T12:00:00.000Z')), 2147000000);
  assert.equal(copyright.COPYRIGHT_START_YEAR, 2023);
  assert.equal(copyright.COPYRIGHT_TIME_ZONE, 'America/New_York');
});
