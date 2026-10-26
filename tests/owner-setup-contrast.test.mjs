import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/owner/FirebaseOwnerGate.module.css', import.meta.url), 'utf8');
const modes = readFileSync(new URL('../src/app/color-modes.css', import.meta.url), 'utf8');
const details = css.match(/^\.details \{([^}]+)\}/m)?.[1];
const paragraphs = css.match(/^\.details p \{([^}]+)\}/m)?.[1];
const dark = modes.match(/^\[data-owner-portal\]\[data-color-mode="dark"\] \{([^}]+)\}/m)?.[1];
function luminance(hex) {
  const channels = hex.slice(1).match(/../g).map(value => parseInt(value, 16) / 255)
    .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}
function contrast(a, b) {
  const values = [luminance(a), luminance(b)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}
function color(rule, property, mode) {
  const match = rule.match(new RegExp(`(?:^|;)\\s*${property}:\\s*var\\((--[a-z-]+),\\s*(#[a-f0-9]{6})\\)`));
  assert.ok(match, `${property} uses a scoped theme variable and explicit light fallback`);
  if (mode === 'light') return match[2];
  const token = dark.match(new RegExp(`${match[1]}:\\s*(#[a-f0-9]{6})`));
  assert.ok(token, `${match[1]} is defined by the owner dark theme`);
  return token[1];
}

test('setup details pair their surface and every text role with the current owner theme', () => {
  assert.match(details, /background:\s*var\(--owner-raised,\s*#faf9f8\)/);
  assert.match(details, /color:\s*var\(--owner-ink,\s*#342a2d\)/);
  assert.match(details, /border:\s*1px solid var\(--owner-line,\s*#e9e5e5\)/);
  assert.match(paragraphs, /color:\s*var\(--owner-muted,\s*#675e61\)/);
  assert.match(details, /overflow-wrap:\s*anywhere/);
  assert.match(css, /\.details summary:focus-visible\s*\{[^}]*outline:\s*3px solid #800014/);
  assert.doesNotMatch(details + paragraphs, /opacity:|visibility:|display:\s*none/);
});

test('setup summary, setting names and help text meet 4.5:1 contrast in dark and light modes', () => {
  for (const mode of ['dark', 'light']) {
    const background = color(details, 'background', mode);
    // Summary/list text use --owner-ink in dark mode; code inherits the list color.
    for (const [role, foreground] of [['summary and settings', color(details, 'color', mode)], ['help text', color(paragraphs, 'color', mode)]]) {
      assert.ok(contrast(foreground, background) >= 4.5, `${mode} ${role} contrast ${contrast(foreground, background).toFixed(2)}`);
    }
  }
});

test('setup diagnostic remains a native expandable details element listing the actual missing fields', () => {
  const source = readFileSync(new URL('../src/owner/FirebaseOwnerGate.tsx', import.meta.url), 'utf8');
  assert.match(source, /<details className=\{styles\.details\}><summary>Setup details for your site developer<\/summary>/);
  assert.match(source, /state\.config\.fields\.map\(field => <li key=\{field\}><code>\{field\}<\/code><\/li>\)/);
  assert.match(source, /Missing settings:/);
});
