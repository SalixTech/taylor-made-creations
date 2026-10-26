// Focused CSS cascade evaluator for source-level regressions, not a browser.
// Matches real compiled selectors, including :is/:where/:not specificity,
// important declarations, inheritance and theme variables on a fixture tree.
import postcss from 'postcss';

const split = (text, separator = ',') => {
  const parts = []; let start = 0, depth = 0, quote = '';
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quote) { if (char === quote && text[i - 1] !== '\\') quote = ''; continue; }
    if (char === '"' || char === "'") { quote = char; continue; }
    if (char === '(' || char === '[') depth++;
    if (char === ')' || char === ']') depth--;
    if (!depth && char === separator) { parts.push(text.slice(start, i).trim()); start = i + 1; }
  }
  return [...parts, text.slice(start).trim()].filter(Boolean);
};
const add = (a, b) => a.map((n, i) => n + b[i]);
const compare = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
const max = values => values.reduce((a, b) => compare(a, b) >= 0 ? a : b, [0, 0, 0]);
const cache = new Map();
function selector(text) {
  if (cache.has(text)) return cache.get(text);
  let i = 0; const groups = [[]], combinators = [];
  while (i < text.length) {
    let char = text[i];
    if (/\s/.test(char)) { while (/\s/.test(text[i] ?? '') && i < text.length) i++; if (groups.at(-1).length && i < text.length && !/[>+~]/.test(text[i])) { groups.push([]); combinators.push(' '); } continue; }
    if (/[>+~]/.test(char)) { combinators.push(char); groups.push([]); i++; continue; }
    const match = text.slice(i).match(/^([.#]?)([\w-]+)|^(\*)/);
    if (match) { groups.at(-1).push({ kind: match[3] ? '*' : match[1] === '.' ? 'class' : match[1] === '#' ? 'id' : 'tag', value: match[2] }); i += match[0].length; continue; }
    if (char === '[') {
      const end = text.indexOf(']', i); const attr = text.slice(i + 1, end).match(/^([\w-]+)\s*(?:(\*=|\^=|\$=|~=|=)\s*["']?([^"']*)["']?)?$/);
      if (!attr) throw Error(`Unsupported attribute ${text.slice(i, end + 1)}`);
      groups.at(-1).push({ kind: 'attr', name: attr[1], operator: attr[2], value: attr[3]?.trim() }); i = end + 1; continue;
    }
    if (char === ':') {
      const pseudo = text.slice(i).match(/^(:{1,2})([\w-]+)/); if (!pseudo) throw Error(`Invalid pseudo ${text}`);
      i += pseudo[0].length; let args = [];
      if (text[i] === '(') { let end = i + 1, depth = 1; for (; end < text.length && depth; end++) { if (text[end] === '(') depth++; if (text[end] === ')') depth--; } args = split(text.slice(i + 1, end - 1)).map(selector); i = end; }
      groups.at(-1).push({ kind: pseudo[1] === '::' ? 'element' : 'pseudo', value: pseudo[2], args }); continue;
    }
    throw Error(`Unsupported selector ${text} at ${i}`);
  }
  const specificity = groups.flat().reduce((sum, token) => add(sum,
    token.kind === 'id' ? [1, 0, 0] : ['class', 'attr'].includes(token.kind) ? [0, 1, 0] : ['tag', 'element'].includes(token.kind) ? [0, 0, 1] : token.kind !== 'pseudo' || token.value === 'where' ? [0, 0, 0] : ['is', 'not', 'has'].includes(token.value) ? max(token.args.map(s => s.specificity)) : [0, 1, 0]), [0, 0, 0]);
  const result = { groups, combinators, specificity }; cache.set(text, result); return result;
}
export function element(tag, attrs = {}, parent) {
  const node = { tag, attrs, parent, children: [], states: new Set() }; parent?.children.push(node); return node;
}
const descendants = node => node.children.flatMap(child => [child, ...descendants(child)]);
function tokenMatches(token, node) {
  const value = token.value;
  if (token.kind === '*') return true;
  if (token.kind === 'tag') return node.tag === value;
  if (token.kind === 'id') return node.attrs.id === value;
  if (token.kind === 'class') return (node.attrs.class ?? '').split(/\s+/).includes(value);
  if (token.kind === 'element') return false;
  if (token.kind === 'attr') {
    const actual = node.attrs[token.name]; if (actual === undefined) return false;
    return !token.operator || (token.operator === '=' ? String(actual) === token.value : token.operator === '*=' ? String(actual).includes(token.value) : token.operator === '^=' ? String(actual).startsWith(token.value) : token.operator === '$=' ? String(actual).endsWith(token.value) : String(actual).split(/\s+/).includes(token.value));
  }
  if (['is', 'where'].includes(value)) return token.args.some(s => matches(s, node));
  if (value === 'not') return !token.args.some(s => matches(s, node));
  if (value === 'has') return descendants(node).some(child => token.args.some(s => matches(s, child)));
  if (value === 'root') return !node.parent;
  if (['any-link', 'link', 'visited'].includes(value)) return node.tag === 'a' && 'href' in node.attrs && (value !== 'visited' || node.states.has('visited'));
  if (['enabled', 'disabled'].includes(value)) return ['button', 'input', 'textarea', 'select', 'option', 'fieldset'].includes(node.tag) && ('disabled' in node.attrs) === (value === 'disabled');
  if (value === 'first-child') return node.parent?.children[0] === node;
  if (value === 'last-child') return node.parent?.children.at(-1) === node;
  if (value === 'focus-within') return node.states.has('focus-visible') || descendants(node).some(child => child.states.has('focus-visible'));
  return node.states.has(value);
}
function matches(s, node, index = s.groups.length - 1) {
  if (!node || !s.groups[index].every(token => tokenMatches(token, node))) return false;
  if (!index) return true;
  const relation = s.combinators[index - 1];
  if (relation === '>') return matches(s, node.parent, index - 1);
  if (relation === '+') return matches(s, node.parent?.children[node.parent.children.indexOf(node) - 1], index - 1);
  if (relation === '~') return node.parent?.children.slice(0, node.parent.children.indexOf(node)).some(sibling => matches(s, sibling, index - 1));
  for (let ancestor = node.parent; ancestor; ancestor = ancestor.parent) if (matches(s, ancestor, index - 1)) return true;
  return false;
}
const colorToken = value => value.match(/var\(.+\)|#[a-f\d]{3,8}\b|\b(?:white|black|transparent|currentColor)\b/i)?.[0];
function declarations(rule) {
  return rule.nodes.filter(node => node.type === 'decl').flatMap(decl => {
    const expanded = { background: 'background-color', border: 'border-color', outline: 'outline-color' }[decl.prop];
    return [decl, ...(expanded && colorToken(decl.value) ? [{ ...decl, prop: expanded, value: colorToken(decl.value) }] : [])];
  });
}
export function cascade(sheets, width = 1280) {
  const rules = [];
  for (const sheet of sheets) postcss.parse(sheet).walkRules(rule => {
    if (rule.selector === ':export') return;
    for (let parent = rule.parent; parent; parent = parent.parent) if (parent.type === 'atrule' && parent.name === 'media') {
      if (/prefers-|forced-colors/.test(parent.params)) return;
      const min = parent.params.match(/min-width:\s*(\d+)px/), max = parent.params.match(/max-width:\s*(\d+)px/);
      if (min && width < +min[1] || max && width > +max[1]) return;
    }
    for (const text of split(rule.selector)) rules.push({ selector: selector(text), declarations: declarations(rule) });
  });
  return function computed(node) {
    const inherited = node.parent ? computed(node.parent) : {};
    const result = Object.fromEntries(Object.entries(inherited).filter(([key]) => key.startsWith('--') || ['color', 'font-size', 'font-weight'].includes(key)));
    const winners = {};
    rules.forEach((rule, order) => {
      if (!matches(rule.selector, node)) return;
      rule.declarations.forEach(decl => {
        const rank = [decl.important ? 1 : 0, ...rule.selector.specificity, order];
        const before = winners[decl.prop];
        const difference = before ? rank.findIndex((value, i) => value !== before.rank[i]) : -1;
        if (!before || difference === -1 || rank[difference] > before.rank[difference]) winners[decl.prop] = { rank, value: decl.value };
      });
    });
    for (const [property, winner] of Object.entries(winners)) result[property] = winner.value;
    const resolve = value => {
      let previous;
      do { previous = value; value = value.replace(/var\((--[\w-]+)(?:,\s*([^()]*))?\)/g, (_, name, fallback) => result[name] ?? fallback ?? ''); } while (previous !== value && value.includes('var('));
      return value;
    };
    for (const [key, value] of Object.entries(result)) result[key] = resolve(value);
    if (result.color === 'inherit') result.color = inherited.color;
    return result;
  };
}
export function contrast(a, b) {
  const luminance = value => {
    let hex = ({ white: '#ffffff', black: '#000000' }[value] ?? value).replace('#', '');
    if (hex.length === 3) hex = [...hex].map(c => c + c).join('');
    if (!/^[a-f\d]{6}$/i.test(hex)) throw Error(`Expected opaque color, got ${value}`);
    return [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(n => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4).reduce((sum, n, i) => sum + n * [.2126, .7152, .0722][i], 0);
  };
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x); return (values[0] + .05) / (values[1] + .05);
}
