// Source-hook fixture for the actual review component; no Firebase/network access.
import { harness, nodes, content } from '../owner-ui-harness.mjs';
const flush = () => new Promise(resolve => setImmediate(resolve));
export async function mountPublicationReview(props) {
  const h = harness();
  const Component = h.load('src/owner/PublicationReview.tsx').PublicationReview;
  const render = () => h.render(Component, props);
  const dialog = () => h.tree;
  const publishButton = () => nodes(dialog().props.actions).find(node => node.type === 'button' && /^Publish \d+ selected/.test(content(node)));
  render(); await flush(); render();
  return { h, render, dialog, publishButton, async publish() { const promise = publishButton().props.onClick(); await flush(); render(); return promise; }, text:()=>content(h.tree) };
}
