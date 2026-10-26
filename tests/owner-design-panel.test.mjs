import { test } from 'node:test';
import assert from 'node:assert/strict';
import { harness, content as visibleText } from './owner-ui-harness.mjs';

function setup(component, props = {}) {
  const h = harness();
  h.overrides['./PhotoUpload'] = { PhotoUpload: 'PhotoUpload' };
  const Component = h.load(`src/owner/${component}.tsx`)[component];
  const catalog = h.load('src/owner/site-design.ts');
  const model = h.load('src/owner/model.ts');
  let content = h.load('src/owner/defaults.ts').createDefaultOwnerContent();
  const input = { content, ...props, onEdit(change) { const next = structuredClone(content); change(next); content = next; input.content = content; } };
  const render = () => h.render(Component, input);
  const field = label => h.find(n => n.type?.name === 'Field' && n.props.label === label);
  const button = label => h.find(n => n.type === 'button' && visibleText(n) === label);
  render();
  return { h, catalog, model, input, render, field, button, get content() { return content; } };
}

test('every website color control stores a bounded color and uses the rendered theme variable', () => {
  const t = setup('OwnerDesignPanel', { onReset() {} });
  for (const color of t.catalog.DESIGN_COLOR_FIELDS) {
    t.h.find(n => n.type === 'input' && n.props['aria-label'] === color.label).props.onChange({ target: { value: '#123456' } });
    t.render();
    assert.equal(t.content.design.colors[color.key], '#123456');
    const cssKey = `--site-${color.key.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}`;
    assert.equal(t.catalog.getSiteThemeStyle(t.content)[cssKey], '#123456');
    assert.equal(t.model.validateOwnerContent(t.content).valid, true);
    t.h.find(n => n.type === 'input' && n.props['aria-label'] === color.label).props.onChange({ target: { value: 'url(javascript:alert(1))' } });
    assert.equal(t.content.design.colors[color.key], '#123456');
    t.h.find(n => n.props['aria-label'] === `Reset ${color.label.toLowerCase()}`).props.onClick();
    t.render();
    assert.equal(t.content.design.colors[color.key], undefined);
  }
});

test('every typography/layout select persists every allowed option and rejects unsupported choices', () => {
  const t = setup('OwnerDesignPanel', { onReset() {} });
  for (const field of t.catalog.DESIGN_SELECT_FIELDS.filter(field => !["textSize", "headingSize"].includes(field.key))) {
    for (const option of field.options) {
      const select = t.h.find(n => n.type?.name === 'OwnerSelect' && n.props.label === field.label);
      select.props.onChange(option.value); t.render();
      assert.equal(t.content.design[field.key], option.value);
      assert.equal(t.model.validateOwnerContent(t.content).valid, true, `${field.key}:${option.value}`);
      const attrs = t.catalog.getSiteThemeAttributes(t.content);
      const theme = t.catalog.getSiteThemeStyle(t.content);
      assert.ok(field.key === 'homeIntro' ? attrs['data-site-home-intro'] === option.value : field.key === 'headerTagline' ? attrs['data-site-header-tagline'] === option.value : Object.keys(theme).length > 0);
    }
    const previous = t.content.design[field.key];
    t.h.find(n => n.type?.name === 'OwnerSelect' && n.props.label === field.label).props.onChange('arbitrary-css');
    assert.equal(t.content.design[field.key], previous);
  }
});

test('restoring the design asks the parent instead of deleting creative content immediately', () => {
  let asked = 0;
  const t = setup('OwnerDesignPanel', { onReset() { asked++; } });
  assert.equal(t.button('Restore original website design').props.disabled, true);
  t.h.find(n => n.type === 'input' && n.props.type === 'color').props.onChange({ target: { value: '#112233' } }); t.render();
  t.button('Restore original website design').props.onClick();
  assert.equal(asked, 1); assert.equal(t.content.design.colors.background, '#112233');
  assert.equal(t.content.home.title, 'Welcome to your new Fursuit');
});

test('every template text is reachable, editable, persistent and individually resettable', () => {
  const t = setup('OwnerTemplateEditor', { group: 'home' });
  for (const field of t.catalog.TEXT_FIELDS) {
    t.input.target = `template-text:${field.key}`; t.render();
    assert.ok(t.field(field.label), field.key);
    t.field(field.label).props.onChange(`New ${field.key}`); t.render();
    assert.equal(t.catalog.getTemplateText(t.content, field.key), `New ${field.key}`);
    assert.equal(t.model.validateOwnerContent(t.content).valid, true, field.key);
    t.button('Reset to original text').props.onClick(); t.render();
    assert.equal(t.content.contentOverrides.text[field.key], undefined);
    assert.equal(t.field(field.label).props.value, field.defaultValue);
  }
});

test('editing keeps reusable template tokens rather than freezing the currently interpolated site name', () => {
  const t = setup('OwnerTemplateEditor', { target: 'template-text:gallery.intro' });
  const field = t.catalog.TEXT_FIELDS.find(item => item.key === 'gallery.intro');
  assert.match(t.field(field.label).props.value, /\{siteName\}/);
  t.field(field.label).props.onChange('Welcome to {siteName}');
  t.input.onEdit(draft => { draft.site.name = 'The New Studio'; }); t.render();
  assert.equal(t.catalog.getTemplateText(t.content, field.key), 'Welcome to The New Studio');
  assert.equal(t.field(field.label).props.value, 'Welcome to {siteName}');
});

test('every template image updates the right stable catalog identity, preserving its latest alt text', () => {
  const t = setup('OwnerTemplateEditor');
  for (const field of t.catalog.IMAGE_FIELDS) {
    t.input.target = `template-image:${field.key}`; t.render();
    const image = t.h.find(n => n.type?.name === 'ImagePicker');
    assert.equal(image.key, field.key);
    image.props.onAlt(`Updated ${field.key} at {siteName}`);
    t.input.onEdit(draft => { draft.site.name = 'My studio'; });
    image.props.onSource('https://example.test/new-photo.webp'); t.render();
    assert.deepEqual(t.content.contentOverrides.images[field.key], { src: 'https://example.test/new-photo.webp', alt: `Updated ${field.key} at {siteName}` });
    assert.equal(t.catalog.getTemplateImage(t.content, field.key).alt, `Updated ${field.key} at My studio`);
    assert.equal(t.model.validateOwnerContent(t.content).valid, true, field.key);
    t.button('Reset image').props.onClick(); t.render();
    assert.equal(t.content.contentOverrides.images[field.key], undefined);
  }
});

test('every template button retains both edited text and latest edited safe destination', () => {
  const t = setup('OwnerTemplateEditor');
  for (const field of t.catalog.LINK_FIELDS) {
    t.input.target = `template-link:${field.key}`; t.render();
    const text = t.field('Button or link text');
    t.field('Where should it go?').props.onChange('/contact');
    text.props.onChange(`New ${field.key}`); t.render();
    assert.deepEqual(t.catalog.getTemplateLink(t.content, field.key), { label: `New ${field.key}`, href: '/contact' });
    assert.equal(t.model.validateOwnerContent(t.content).valid, true);
    t.button('Reset button').props.onClick(); t.render();
    assert.equal(t.content.contentOverrides.links[field.key], undefined);
  }
});

test('page-content search filters only the chosen catalog group, and clearing restores it', () => {
  const t = setup('OwnerTemplateEditor', { group: 'home' });
  const search = t.h.find(n => n.type === 'input' && n.props.type === 'search');
  search.props.onChange({ target: { value: 'commission section' } }); t.render();
  assert.ok(t.field('Commission section heading'));
  assert.equal(t.field('Prices card description'), undefined);
  t.button('Clear search').props.onClick(); t.render();
  assert.ok(t.field('Prices card description'));
  assert.equal(t.field('Footer tagline'), undefined);
});

function blocksSetup() {
  const h = harness(); h.overrides['./PhotoUpload'] = { PhotoUpload: 'PhotoUpload' };
  const { OwnerBlocksEditor, createBlock } = h.load('src/owner/OwnerBlocksEditor.tsx');
  let page = { id: 'test-page', kind: 'custom', blocks: [createBlock('text'), createBlock('faq'), createBlock('heading')] };
  const props = { page, onEdit(change) { page = structuredClone(page); change(page); props.page = page; }, onRemove(_block, remove) { remove(); } };
  const render = () => h.render(OwnerBlocksEditor, props); render();
  return { h, props, render, get page() { return page; } };
}

test('moving an older selected section handler follows its stable ID after reorder', () => {
  const t = blocksSetup(); const id = t.page.blocks[0].id;
  const move = t.h.find(n => n.type?.name === 'MoveButtons' && n.props.index === 0).props.onMove;
  t.props.onEdit(page => { page.blocks.reverse(); });
  move(-1); t.render();
  assert.equal(t.page.blocks[1].id, id);
});

test('FAQ question edits follow stable identity rather than a stale list index', () => {
  const t = blocksSetup();
  const faq = t.page.blocks[1]; const id = faq.items[0].id;
  t.props.onEdit(page => { page.blocks[1].items.push({ id: 'another-question', question: 'Another?', answer: 'Another answer' }); }); t.render();
  const question = t.h.find(n => n.type?.name === 'Field' && n.props.label === 'Question 1');
  t.props.onEdit(page => { page.blocks[1].items.reverse(); });
  question.props.onChange('Changed original question'); t.render();
  assert.equal(t.page.blocks[1].items.find(item => item.id === id).question, 'Changed original question');
  assert.equal(t.page.blocks[1].items[0].question, 'Another?');
});

test('duplicating a section creates fresh block and FAQ question identities without sharing data', () => {
  const t = blocksSetup();
  t.props.focusedBlockId = t.page.blocks[1].id; t.render();
  t.h.find(n => n.type === 'button' && visibleText(n) === 'Duplicate').props.onClick();
  assert.equal(t.page.blocks.length, 4);
  const [original, copy] = t.page.blocks.slice(1, 3);
  assert.notEqual(copy.id, original.id); assert.notEqual(copy.items[0].id, original.items[0].id);
  assert.equal(copy.items[0].question, original.items[0].question);
});

function appearanceSetup(kind = 'text', withImage = false) {
  const h = harness(); h.overrides['./PhotoUpload'] = { PhotoUpload: 'PhotoUpload' };
  const { OwnerAppearancePanel } = h.load('src/owner/OwnerAppearancePanel.tsx');
  const helpers = h.load('src/owner/appearance.ts');
  let value;
  const props = { kind, withImage, value, onEdit(change) { value = structuredClone(value ?? {}); change(value); props.value = value; }, onReset() { value = undefined; props.value = value; } };
  const render = () => h.render(OwnerAppearancePanel, props); render();
  const select = label => h.find(n => n.type?.name === 'OwnerSelect' && n.props.label === label);
  return { h, props, render, select, helpers, get value() { return value; } };
}

test('per-element appearance inherits by default and every exposed text option affects safe renderer styles', () => {
  const t = appearanceSetup();
  assert.deepEqual(t.helpers.getElementAppearanceStyle(t.value), {});
  const mapping = { 'Font for this element': 'font', 'Text alignment': 'align' };
  for (const [label, key] of Object.entries(mapping)) {
    const options = t.select(label).props.options;
    for (const option of options.filter(option => option.value)) {
      t.select(label).props.onChange(option.value); t.render();
      assert.equal(t.value[key], option.value);
      assert.ok(Object.keys(t.helpers.getElementAppearanceStyle(t.value)).length > 0);
    }
    const previous = t.value[key];
    t.select(label).props.onChange('url(invalid)');
    assert.equal(t.value[key], previous);
    t.select(label).props.onChange(''); t.render();
    assert.equal(t.value[key], undefined);
  }
  for (const [label, key, css] of [['Appearance: text color', 'textColor', '--element-text-color'], ['Appearance: background color', 'backgroundColor', '--element-background']]) {
    t.h.find(n => n.type === 'input' && n.props['aria-label'] === label).props.onChange({ target: { value: '#123456' } }); t.render();
    assert.equal(t.value[key], '#123456');
    assert.equal(t.helpers.getElementAppearanceStyle(t.value)[css], '#123456');
    t.h.find(n => n.type === 'input' && n.props['aria-label'] === label).props.onChange({ target: { value: 'red;display:none' } });
    assert.equal(t.value[key], '#123456');
  }
  t.h.find(n => n.type === 'button' && visibleText(n) === 'Reset this appearance').props.onClick(); t.render();
  assert.equal(t.value, undefined);
  assert.deepEqual(t.helpers.getElementAppearanceStyle(t.value), {});
});

test('photo appearance offers real fit/focal-point controls, bounded 0–100, without phony text controls', () => {
  const t = appearanceSetup('image');
  assert.equal(t.select('Font for this element'), undefined);
  assert.deepEqual(t.helpers.getImageAppearanceStyle(t.value), {});
  t.select('Photo fit').props.onChange('cover'); t.render();
  assert.equal(t.helpers.getImageAppearanceStyle(t.value).objectFit, 'cover');
  const ranges = t.h.all(n => n.type === 'input' && n.props.type === 'range');
  ranges[0].props.onChange({ target: { value: '17' } }); ranges[1].props.onChange({ target: { value: '83' } }); t.render();
  assert.equal(t.helpers.getImageAppearanceStyle(t.value).objectPosition, '17% 83%');
  ranges[0].props.onChange({ target: { value: '-1' } }); ranges[1].props.onChange({ target: { value: '101' } });
  assert.equal(t.value.imagePositionX, 17); assert.equal(t.value.imagePositionY, 83);
  t.select('Photo fit').props.onChange(''); t.render();
  assert.equal(t.value.imageFit, undefined);
});

test('photo-and-text sections include both typography and photo fitting controls', () => {
  const t = appearanceSetup('section', true);
  assert.ok(t.select('Font for this element'));
  assert.ok(t.select('Photo fit'));
});

test('every catalog style persists independently, validates, and can reset without touching its content', () => {
  const t = setup('OwnerTemplateEditor');
  const { OwnerElementAppearance } = t.h.load('src/owner/OwnerAppearancePanel.tsx');
  for (const field of t.catalog.STYLE_FIELDS) {
    const props = { content: t.content, styleKey: field.key, onEdit: t.input.onEdit };
    let panel = t.h.render(OwnerElementAppearance, props);
    assert.equal(panel.props.kind, field.kind, field.key);
    panel.props.onEdit(value => { value.backgroundColor = '#121212'; if (field.kind === 'image') { value.imageFit = 'cover'; value.imagePositionX = 27; } else { value.font = 'serif'; value.align = 'right'; value.textColor = '#eeeeee'; } });
    assert.equal(t.model.validateOwnerContent(t.content).valid, true, field.key);
    assert.equal(t.content.contentOverrides.styles[field.key].backgroundColor, '#121212');
    props.content = t.content;
    panel = t.h.render(OwnerElementAppearance, props);
    panel.props.onReset();
    assert.equal(t.content.contentOverrides.styles[field.key], undefined);
  }
  assert.equal(t.content.home.title, 'Welcome to your new Fursuit');
  assert.equal(t.h.render(OwnerElementAppearance, { content: t.content, styleKey: 'unknown.property', onEdit: t.input.onEdit }), null, 'No inspector for an unsupported/non-rendering property');
});

test('block appearance edits follow stable identity after reorder and duplication retains independent styling', () => {
  const t = blocksSetup(); const id = t.page.blocks[0].id;
  const appearance = t.h.find(n => n.type?.name === 'OwnerAppearancePanel');
  t.props.onEdit(page => { page.blocks.reverse(); });
  appearance.props.onEdit(value => { value.textColor = '#123456'; }); t.render();
  assert.equal(t.page.blocks.find(item => item.id === id).appearance.textColor, '#123456');
  assert.equal(t.page.blocks[0].appearance, undefined);
  t.props.focusedBlockId = id; t.render();
  t.h.find(n => n.type === 'button' && visibleText(n) === 'Duplicate').props.onClick();
  const original = t.page.blocks.find(item => item.id === id), copy = t.page.blocks.at(-1);
  assert.notEqual(copy.id, original.id); assert.deepEqual(copy.appearance, original.appearance);
});

test('restore design remains available when only individual styling is customized', () => {
  const t = setup('OwnerDesignPanel', { onReset() {} });
  t.input.onEdit(draft => { draft.contentOverrides = { styles: { 'home.title': { font: 'serif' } } }; }); t.render();
  assert.equal(t.content.design, undefined);
  assert.equal(t.button('Restore original website design').props.disabled, false);
});

test('restoring design removes appearance only after confirmation and preserves all creative content', () => {
  const h = harness();
  h.overrides['./PhotoUpload'] = { PhotoUpload: 'PhotoUpload' };
  h.overrides['./PremadePhotoEditor'] = { PremadePhotoEditor: function PremadePhotoEditor() {} };
  const Builder = h.load('src/owner/OwnerVisualBuilder.tsx').OwnerVisualBuilder;
  let value = h.load('src/owner/defaults.ts').createDefaultOwnerContent();
  value.design = { bodyFont: 'serif' };
  value.contentOverrides = { text: { 'home.stripTitle': 'Keep my words' }, styles: { 'home.title': { textColor: '#abcdef' } } };
  value.pages[0].titleAppearance = { align: 'right' };
  value.pages[0].blocks.push({ id: 'styled-paragraph', type: 'text', heading: 'Keep my heading', body: 'Keep my paragraph', appearance: { font: 'mono' } });
  let confirm;
  const props = { browsing: false, onBrowsingChange(value) { props.browsing = value; }, content: value, page: value.pages[0], onEdit(change) { value = structuredClone(value); change(value); props.content = value; props.page = value.pages[0]; }, onPageChange() {}, onManagePages() {}, onAddPage() {}, onPrices() {}, onRemove(_title, _description, action) { confirm = action; }, liveShopVisibility: false, canUpdateLiveShop: false, onUpdateLiveShop() {} };
  h.render(Builder, props);
  h.find(n => n.type === 'button' && visibleText(n) === 'Design').props.onClick(); h.render(Builder, props);
  h.find(n => n.type?.name === 'OwnerDesignPanel').props.onReset();
  assert.equal(value.design.bodyFont, 'serif');
  assert.equal(typeof confirm, 'function'); confirm();
  assert.equal(value.design, undefined);
  assert.equal(value.contentOverrides.styles, undefined);
  assert.equal(value.pages[0].titleAppearance, undefined);
  assert.equal(value.pages[0].blocks.at(-1).appearance, undefined);
  assert.equal(value.contentOverrides.text['home.stripTitle'], 'Keep my words');
  assert.equal(value.pages[0].blocks.at(-1).heading, 'Keep my heading');
  assert.equal(value.pages[0].blocks.at(-1).body, 'Keep my paragraph');
});

test('block inspector omits inert spacer/divider appearance and pure-photo typography', () => {
  const t = blocksSetup();
  t.props.onEdit(page => { page.blocks = [
    { id: 'plain-image', type: 'image', src: '/images/logo.png', alt: 'Logo', caption: '' },
    { id: 'divider', type: 'divider' },
    { id: 'spacer', type: 'spacer', size: 'small' },
  ]; }); t.render();
  let panels = t.h.all(n => n.type?.name === 'OwnerAppearancePanel');
  assert.equal(panels.length, 1);
  assert.equal(panels[0].props.kind, 'image');
  t.props.onEdit(page => { page.blocks[0].caption = 'A caption that can be styled'; }); t.render();
  panels = t.h.all(n => n.type?.name === 'OwnerAppearancePanel');
  assert.equal(panels.length, 1);
  assert.equal(panels[0].props.kind, 'section');
});

test('brand text and logo select their corresponding controls, while visitor markup has no editor targets', () => {
  const h = harness();
  h.overrides['@/owner/media-client'] = { useOwnerMediaSource: src => ({ src, error: null }) };
  const { Brand } = h.load('src/components/Brand.tsx');
  h.render(Brand, { name: 'My studio', editable: true, privateMedia: true });
  const name = h.find(n => n.props['data-owner-edit'] === 'site');
  assert.equal(visibleText(name), 'My studio');
  const logo = h.find(n => n.type?.name === 'BrandLogo');
  assert.equal(logo.props.privateMedia, true);
  h.hooks = []; h.render(logo.type, logo.props);
  assert.equal(h.tree.props['data-owner-edit'], 'template-image:site.logo');
  assert.equal(h.tree.props['aria-label'], 'Edit site logo');
  h.hooks = []; h.render(Brand, { name: 'My studio', editable: false });
  assert.equal(h.find(n => n.props['data-owner-edit']), undefined);
  const publicLogo = h.find(n => n.type?.name === 'BrandLogo');
  h.hooks = []; h.render(publicLogo.type, publicLogo.props);
  assert.equal(h.tree.props['data-owner-edit'], undefined);
});

test('footer business name can be selected without making dynamic copyright editable', () => {
  const h = harness();
  const { SiteContentFrame } = h.load('src/components/SiteContent.tsx');
  const content = h.load('src/owner/defaults.ts').createDefaultOwnerContent();
  h.render(SiteContentFrame, { content, page: content.pages[0], mode: 'editor', editable: true });
  const name = h.find(n => n.type === 'span' && n.props['data-owner-edit'] === 'site');
  assert.equal(visibleText(name), content.site.name);
  assert.equal(h.find(n => n.type?.name === 'CopyrightRange').props['data-owner-edit'], undefined);
});
