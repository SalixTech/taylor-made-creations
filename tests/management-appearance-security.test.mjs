import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sourceLoader } from './scout-source-loader.mjs';
const load = sourceLoader(), model = load('src/owner/model.ts'), defaults = load('src/owner/defaults.ts'), design = load('src/owner/site-design.ts'), appearance = load('src/owner/appearance.ts');
const safe = { textColor: '#123456', backgroundColor: '#fedcba', font: 'serif', textSize: 'large', align: 'right', imageFit: 'contain', imagePositionX: 23, imagePositionY: 77 };
const blocks = [
  { id: 'text', type: 'text', heading: 'Text', body: 'Text body' },
  { id: 'image', type: 'image', src: '/images/heads.webp', alt: 'Image', caption: 'Caption' },
  { id: 'link', type: 'link', href: '/gallery', label: 'Go' },
  { id: 'heading', type: 'heading', text: 'Heading', level: 2 },
  { id: 'list', type: 'list', items: ['First', 'Second'], style: 'bullet' },
  { id: 'divider', type: 'divider' },
  { id: 'spacer', type: 'spacer', size: 'medium' },
  { id: 'faq', type: 'faq', items: [{ id: 'one', question: 'Question?', answer: 'Answer.' }] },
  { id: 'feature', type: 'feature', src: '/images/heads.webp', alt: 'Feature', heading: 'Heading', body: 'Text', imageSide: 'right' },
];
const reject = value => { const result = model.validateOwnerContent(value); assert.equal(result.valid, false, 'Unsafe appearance accepted'); assert.throws(() => model.createPublicContentSnapshot(value)); };

test('all finite style targets preserve bounded appearance through private/public serialization', () => {
  const value = defaults.createDefaultOwnerContent(); value.contentOverrides = { styles: Object.fromEntries(design.STYLE_FIELDS.map(field => [field.key, structuredClone(safe)])) }; assert.equal(model.validateOwnerContent(value).valid, true); const published = model.createPublicContentSnapshot(value); assert.deepEqual(published.contentOverrides.styles, value.contentOverrides.styles); assert.deepEqual(model.publicContentToOwnerContent(published).contentOverrides.styles, value.contentOverrides.styles);
  published.contentOverrides.styles[design.STYLE_FIELDS[0].key].textColor = '#ffffff'; assert.equal(value.contentOverrides.styles[design.STYLE_FIELDS[0].key].textColor, '#123456');
});
for (const block of blocks) test(`block ${block.type} appearance survives publish but remains independent from private draft`, () => {
  const value = defaults.createDefaultOwnerContent(); value.pages[0].blocks = [{ ...block, appearance: structuredClone(safe) }]; assert.equal(model.validateOwnerContent(value).valid, true); const published = model.createPublicContentSnapshot(value); assert.deepEqual(published.pages[0].blocks[0].appearance, safe); published.pages[0].blocks[0].appearance.textColor = '#ffffff'; assert.equal(value.pages[0].blocks[0].appearance.textColor, '#123456');
});
const invalids = [
  ['textColor', ['red', '#fff', '#123456;display:none', 'url(javascript:alert(1))', null, 1]],
  ['backgroundColor', ['transparent', '#ffffff;background:url(https://evil.example)', null, {}]],
  ['font', ['inherit', '__proto__', 'constructor', 'serif;display:none', null, 1]],
  ['textSize', ['900px', 'calc(100vw)', 'inherit', null, 1]],
  ['align', ['justify', 'left;display:none', null, 1]],
  ['imageFit', ['fill', 'url(https://evil.example)', null, 1]],
  ['imagePositionX', [-1, 101, Infinity, NaN, '50', null]],
  ['imagePositionY', [-1, 101, -Infinity, NaN, '50', null]],
];
for (const [key, attacks] of invalids) test(`appearance ${key} rejects CSS injection, unsupported tokens, and wrong types at all persistence locations`, () => {
  for (const bad of attacks) for (const location of ['template', 'block', 'title']) { const value = defaults.createDefaultOwnerContent(), style = { [key]: bad }; if (location === 'template') value.contentOverrides = { styles: { 'home.title': style } }; else if (location === 'block') value.pages[0].blocks = [{ ...blocks[0], appearance: style }]; else value.pages[0].titleAppearance = style; reject(value); }
});
test('appearance projection omits removed-page styles and title/block styles without mutating the draft', () => {
  let value = defaults.createDefaultOwnerContent(); value.contentOverrides = { styles: { 'examples.title': safe, 'site.brand': safe } }; const page = value.pages.find(p => p.builtinKey === 'examples'); page.titleAppearance = safe; page.blocks = [{ ...blocks[0], appearance: safe }]; value = model.trashPage(value, page.id); const published = model.createPublicContentSnapshot(value); assert.equal(published.contentOverrides.styles['examples.title'], undefined); assert.deepEqual(published.contentOverrides.styles['site.brand'], safe); assert.equal(published.pages.some(p => p.id === page.id), false); assert.deepEqual(value.pages.find(p => p.id === page.id).titleAppearance, safe);
});
test('custom-page title appearance is validated and survives explicit public projection without extra fields', () => {
  const value = model.createCustomPage(defaults.createDefaultOwnerContent(), { title: 'Custom', slug: 'custom' }); value.pages.at(-1).titleAppearance = safe; const published = model.createPublicContentSnapshot(value); assert.deepEqual(published.pages.at(-1).titleAppearance, safe); assert.deepEqual(model.publicContentToOwnerContent(published).pages.at(-1).titleAppearance, safe);
});
test('arbitrary CSS selectors, style objects, prototypes, URLs and raw HTML are not style targets or properties', () => {
  for (const style of [{ cssText: 'body{display:none}' }, { position: 'fixed', inset: 0 }, { backgroundImage: 'url(https://evil.example)' }, { html: '<script>bad</script>' }, [], null, Object.create({ textColor: '#123456' })]) { const value = defaults.createDefaultOwnerContent(); value.contentOverrides = { styles: { 'home.title': style } }; reject(value); }
  for (const key of ['body', ':root', '.ownerPortal', 'script', 'home.unknown', '__proto__']) { const value = defaults.createDefaultOwnerContent(); value.contentOverrides = { styles: Object.fromEntries([[key, safe]]) }; reject(value); }
});
test('appearance rendering independently filters unsafe tokens before they could become CSS', () => {
  const unsafe = { textColor: 'url(javascript:alert(1))', backgroundColor: '#123456;display:none', font: '__proto__', textSize: '100vw', align: 'left;display:none', imageFit: 'expression(x)', imagePositionX: Infinity, imagePositionY: -1 };
  assert.deepEqual(appearance.getElementAppearanceStyle(unsafe), {}); assert.deepEqual(appearance.getImageAppearanceStyle(unsafe), {}); assert.equal(appearance.getElementAppearanceAttributes(unsafe)['data-element-appearance'], undefined);
  assert.deepEqual(appearance.getImageAppearanceStyle({ imagePositionX: 0 }), { objectPosition: '0% 50%' }); assert.deepEqual(appearance.getImageAppearanceStyle({ imagePositionY: 100 }), { objectPosition: '50% 100%' });
});
