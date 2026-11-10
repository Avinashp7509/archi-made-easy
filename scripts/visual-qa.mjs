#!/usr/bin/env node
// Repeatable visual QA for the viewer and the architecture workbench.
//
// It renders a fixed set of documents, opens each in a real browser at six viewports and
// both themes, drives the workbench through its states, and in every state:
//   * runs geometry, contrast, text-size, icon, overflow and state checks in the page;
//   * collects runtime errors;
//   * optionally takes a screenshot and compares it with the committed reference.
//
// Usage:
//   node scripts/visual-qa.mjs                 run every check, write the report
//   node scripts/visual-qa.mjs --shots         also write screenshots (docs/visual-qa/archi-made-easy-after/)
//   node scripts/visual-qa.mjs --compare       also compare screenshots with the committed references
//   node scripts/visual-qa.mjs --quick         two viewports, one theme (used by the test suite)
//
// The specification is docs/program/PHASE5-UX-ADDENDUM.md; the matrix is described in
// docs/visual-qa/PLAYWRIGHT-TEST-MATRIX.md. Exit code 1 means a critical or high defect.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ChromeVisualBrowser, findChrome } from '../archi-made-easy/bin/visual-check.mjs';
import { sameEntry } from '../archi-made-easy/renderers/shared/path-semantics.mjs';
import { authoredWebHa, longLabelWebHa, denseMicroservices } from './visual-qa-fixtures.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const skillRoot = path.join(repoRoot, 'archi-made-easy');

export const VIEWPORTS = [[1920, 1080], [1440, 900], [1366, 768], [1280, 800], [768, 1024], [390, 844]];
export const THEMES = ['light', 'dark'];

/** Checks that run in the page in every state. Returns a list of defects. */
const COMMON_CHECKS = String.raw`(() => {
  const defects = [];
  const add = (check, severity, detail) => defects.push({ check, severity, detail });
  const visible = (el) => { if (!el || el.hidden) return false; const s = getComputedStyle(el); if (s.display === 'none' || s.visibility === 'hidden') return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const rect = (el) => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
  const overlap = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  const vw = innerWidth; const vh = innerHeight;
  const root = document.documentElement;
  const q = (s) => document.querySelector(s);
  const rail = q('.ame-rail'); const vitals = q('.ame-vitals'); const inspector = q('.ame-inspector');
  const canvas = q('.diagram-container'); const svg = canvas && canvas.querySelector('svg'); const nav = q('.diagram-nav'); const legend = svg && svg.querySelector('[data-legend]');
  const embed = root.getAttribute('data-embed') === 'true'; const present = root.getAttribute('data-present') === 'true';
  // The inspector docks beside the canvas only where the diagram stays readable; otherwise it is a drawer.
  const docked = vw >= 1200 && root.getAttribute('data-ame-dock') !== 'drawer'; const narrow = vw < 900;

  // 1. Horizontal overflow and the unintended horizontal scrollbar that comes with it.
  if (root.scrollWidth > vw) add('horizontal-overflow', 'high', 'document is ' + root.scrollWidth + 'px wide in a ' + vw + 'px viewport');

  // 2. Region collisions. Fixed regions must not overlap each other, and on docked layouts
  //    must not overlap the canvas. Drawer and sheet layouts overlay the canvas by design.
  const regions = [['mode rail', rail], ['vitals bar', vitals], ['inspector', inspector]].filter(([, el]) => visible(el)).map(([name, el]) => [name, rect(el)]);
  for (let i = 0; i < regions.length; i += 1) for (let j = i + 1; j < regions.length; j += 1) {
    const area = overlap(regions[i][1], regions[j][1]);
    // On narrow screens the sheet sits above the tab bar and under the vitals strip; they may touch, not overlap.
    if (area > 2) add('region-overlap', 'high', regions[i][0] + ' overlaps ' + regions[j][0] + ' by ' + Math.round(area) + 'px²');
  }
  if (visible(canvas) && !embed) {
    const c = rect(canvas);
    const remainingScroll = Math.max(0, root.scrollHeight - vh - scrollY);
    const bottomAnchored = (r) => r.bottom >= vh - 1 && r.top > vh * 0.2 && r.width > vw * 0.4;
    const overlapHeight = (a, b) => Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    const clip = (a, b) => { const left = Math.max(a.left, b.left); const top = Math.max(a.top, b.top); const right = Math.min(a.right, b.right); const bottom = Math.min(a.bottom, b.bottom); return right > left && bottom > top ? { left, top, right, bottom, width: right - left, height: bottom - top } : null; };
    for (const [name, r] of regions) {
      const area = overlap(c, r);
      if (area <= 2) continue;
      const byDesign = name === 'inspector' && !docked; // drawer or sheet
      const clearable = bottomAnchored(r) && overlapHeight(c, r) <= remainingScroll + 1;
      // Workbench off: the rail is a column of icons in the page gutter; it must not reach the canvas.
      if (!byDesign && !clearable) add('canvas-covered', 'critical', name + ' covers ' + Math.round(area) + 'px² of the canvas');
    }
    // 3. Canvas tools and legend must be reachable: not under a workbench region. A sheet
    //    or drawer may cover them while it is open; that is reported as a note, not a defect.
    for (const [label, el] of [['canvas tools', nav], ['legend', legend]]) {
      if (!visible(el)) continue;
      const r = clip(rect(el), c);
      if (!r) continue;
      if (r.bottom < 0 || r.top > vh) continue; // scrolled out of view, reachable by scrolling
      for (const [name, region] of regions) {
        const area = overlap(r, region);
        if (area <= 2) continue;
        const sheetOpen = name === 'inspector' && !docked;
        if (sheetOpen) add('covered-while-sheet-open', 'note', label + ' is under the open ' + (narrow ? 'sheet' : 'drawer'));
        else if (!(bottomAnchored(region) && overlapHeight(r, region) <= remainingScroll + 1)) add('toolbar-legend-collision', 'high', label + ' is covered by the ' + name);
      }
    }
    // At rest the tools must not sit on the legend (the inherited gate checks the same); while the
    // reader has zoomed or panned, the legend moves under the tools like any other part of the diagram.
    const viewScale = svg ? Number(svg.getAttribute('data-view-scale') || 1) : 1;
    const atRest = !svg || (Math.abs(viewScale - 1) < 0.001 && !/translate\((?!0px, 0px\))/.test(svg.style.transform || ''));
    if (atRest && visible(nav) && visible(legend) && clip(rect(legend), c) && overlap(rect(nav), clip(rect(legend), c)) > 2) {
      // With a sheet or drawer open the tools are lifted to stay reachable and may sit on the legend.
      if (!docked && visible(inspector)) add('covered-while-sheet-open', 'note', 'canvas tools are lifted over the legend while the sheet is open');
      else add('toolbar-legend-collision', 'high', 'canvas tools overlap the legend');
    }
  }

  // 4. Clipped components: every node must lie inside the diagram's own coordinate space.
  if (svg && svg.viewBox && svg.viewBox.baseVal && svg.viewBox.baseVal.width) {
    const vb = svg.viewBox.baseVal;
    for (const node of svg.querySelectorAll('g[data-node-id]')) {
      let b; try { b = node.getBBox(); } catch (_) { continue; }
      if (b.x < vb.x - 1 || b.y < vb.y - 1 || b.x + b.width > vb.x + vb.width + 1 || b.y + b.height > vb.y + vb.height + 1) add('clipped-component', 'high', node.getAttribute('data-node-id') + ' lies outside the diagram bounds');
    }
  }

  // 5. Off-screen and undersized controls in the fixed regions.
  const scrollers = new Set(['ame-rail', 'ame-vitals', 'ame-inspector-body', 'ame-table-wrap', 'export-menu', 'preset-menu', 'diagram-nav']);
  const insideScroller = (el) => { for (let p = el.parentElement; p; p = p.parentElement) { if ([...p.classList].some((c) => scrollers.has(c))) return true; } return false; };
  for (const control of document.querySelectorAll('.toolbar > button, .toolbar-group > button, .toolbar-group > .preset-wrap > button, .export-wrap > button, .ame-rail button, .ame-vitals button, .ame-inspector button, .ame-inspector select, .ame-inspector input')) {
    if (!visible(control)) continue;
    const r = rect(control);
    if (!insideScroller(control) && (r.left < -1 || r.right > vw + 1 || r.top < -1 || r.bottom > vh + 1)) add('off-screen-control', 'high', (control.getAttribute('aria-label') || control.textContent.trim().slice(0, 40)) + ' extends outside the viewport');
    if (control.tagName !== 'INPUT' && (r.width < 24 || r.height < 24)) add('small-target', 'medium', (control.getAttribute('aria-label') || control.textContent.trim().slice(0, 40)) + ' is ' + Math.round(r.width) + 'x' + Math.round(r.height) + 'px (minimum 24x24)');
    if (!control.getAttribute('aria-label') && !control.textContent.trim() && !control.title) add('unnamed-control', 'high', control.outerHTML.slice(0, 80));
  }

  // 6. Cut-off labels: text clipped inside buttons, cards and rail labels with no tooltip.
  for (const el of document.querySelectorAll('.ame-rail-label, .ame-btn, .ame-card-title, .ame-card-note, .ame-inspector h2, .ame-eyebrow')) {
    if (!visible(el)) continue;
    if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflow !== 'visible') add('cut-off-label', 'medium', '"' + el.textContent.trim().slice(0, 50) + '" is clipped');
  }
  // Truncation with a tooltip (title, readouts) is by design; a readout value must never be cut.
  for (const el of document.querySelectorAll('.ame-readout-value')) {
    if (visible(el) && el.scrollWidth > el.clientWidth + 1) add('cut-off-label', 'high', 'figure "' + el.textContent.trim() + '" is cut off');
  }

  // 7. Unintended scrollbars inside the regions.
  for (const el of document.querySelectorAll('.header, .header *, .ame-inspector-head, .ame-card, .ame-detail, .ame-section')) {
    if (!visible(el) || [...el.classList].some((c) => scrollers.has(c))) continue;
    const s = getComputedStyle(el);
    if ((s.overflowX === 'auto' || s.overflowX === 'scroll') && el.scrollWidth > el.clientWidth + 1) add('unintended-scrollbar', 'medium', (el.className || el.tagName) + ' scrolls sideways');
  }

  // 8. Colour contrast (WCAG 2.x relative luminance) for text in the regions and on the canvas.
  const parse = (value) => {
    if (!value) return null;
    let m = value.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/);
    if (m) return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] == null ? 1 : (/%$/.test(m[4]) ? parseFloat(m[4]) / 100 : Number(m[4]))];
    m = value.match(/^color\(srgb\s+([\d.e-]+)\s+([\d.e-]+)\s+([\d.e-]+)(?:\s*\/\s*([\d.]+%?))?\s*\)$/);
    if (m) return [Number(m[1]) * 255, Number(m[2]) * 255, Number(m[3]) * 255, m[4] == null ? 1 : (/%$/.test(m[4]) ? parseFloat(m[4]) / 100 : Number(m[4]))];
    return null;
  };
  const over = (top, bottom) => { const a = top[3]; return [top[0] * a + bottom[0] * (1 - a), top[1] * a + bottom[1] * (1 - a), top[2] * a + bottom[2] * (1 - a), 1]; };
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const ratio = (a, b) => { const l1 = lum(a); const l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
  const pageBg = parse(getComputedStyle(document.body).backgroundColor) || [255, 255, 255, 1];
  const backgroundOf = (el) => {
    const layers = [];
    for (let p = el; p && p.nodeType === 1; p = p.parentElement) {
      const s = getComputedStyle(p);
      const before = getComputedStyle(p, '::before');
      const pseudo = before.content !== 'none' && before.position === 'absolute' && before.zIndex === '-1' ? parse(before.backgroundColor) : null;
      if (pseudo && pseudo[3] > 0) layers.push(pseudo);
      const own = parse(s.backgroundColor);
      if (own && own[3] > 0) layers.push(own);
      if (layers.length && layers[layers.length - 1][3] >= 0.999) break;
    }
    let bg = pageBg;
    for (let i = layers.length - 1; i >= 0; i -= 1) bg = over(layers[i], bg);
    return bg;
  };
  const opacityOf = (el) => { let o = 1; for (let p = el; p && p.nodeType === 1; p = p.parentElement) o *= Number(getComputedStyle(p).opacity); return o; };
  const lowContrast = new Map();
  const report = (where, text, value, need) => { const key = where + '|' + text; if (!lowContrast.has(key)) lowContrast.set(key, where + ' "' + text + '" has contrast ' + value.toFixed(2) + ' (needs ' + need + ')'); };
  const textElements = document.querySelectorAll('.header h1, .header .subtitle, .toolbar-group > button, .export-wrap > button, .ame-rail-label, .ame-basis-line, .ame-readout-label, .ame-readout-value, .ame-readout-was, .ame-inspector h2, .ame-inspector p, .ame-inspector li, .ame-inspector th, .ame-inspector td, .ame-inspector dt, .ame-inspector dd, .ame-inspector .ame-btn, .ame-inspector .ame-card-title, .ame-inspector .ame-card-note, .ame-tag, .ame-eyebrow, .card h3, .card li');
  for (const el of textElements) {
    if (!visible(el) || el.disabled || el.closest('[disabled]')) continue;
    const text = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(' ').trim();
    if (!text) continue;
    const s = getComputedStyle(el);
    const fg = parse(s.color); if (!fg) continue;
    const bg = backgroundOf(el);
    const alpha = fg[3] * opacityOf(el);
    const value = ratio(over([fg[0], fg[1], fg[2], alpha], bg), bg);
    const size = parseFloat(s.fontSize); const large = size >= 24 || (size >= 18.66 && Number(s.fontWeight) >= 700);
    if (value < (large ? 3 : 4.5)) report(el.closest('.ame-inspector') ? 'inspector' : el.closest('.ame-vitals') ? 'vitals' : el.closest('.ame-rail') ? 'rail' : el.closest('.toolbar') ? 'toolbar' : el.closest('.header') ? 'title strip' : 'page', text.slice(0, 40), value, large ? '3' : '4.5');
    // 9. Tiny interface text.
    if (size < 9) add('tiny-text', 'medium', '"' + text.slice(0, 40) + '" is set at ' + size + 'px');
  }
  if (svg) {
    const mask = parse(getComputedStyle(svg.querySelector('.c-mask') || svg).fill) || backgroundOf(canvas);
    const canvasBg = over(mask[3] >= 0.999 ? mask : (parse(getComputedStyle(root).getPropertyValue('--panel')) || mask), pageBg);
    const scale = svg.getBoundingClientRect().width / (svg.viewBox.baseVal.width || 1);
    let smallest = null; let focusDimmed = 0;
    for (const text of svg.querySelectorAll('g[data-node-id] text')) {
      if (!text.textContent.trim()) continue;
      const s = getComputedStyle(text);
      if (s.display === 'none' || s.visibility === 'hidden') continue;
      const node = text.closest('g[data-node-id]');
      const box = node.querySelector(':scope > rect:not(.c-mask)');
      const fill = box ? parse(getComputedStyle(box).fill) : null;
      const bg = fill ? over(fill, canvasBg) : canvasBg;
      const fg = parse(s.fill); if (!fg) continue;
      const alpha = fg[3] * opacityOf(text);
      const value = ratio(over([fg[0], fg[1], fg[2], alpha], bg), bg);
      // Spotlight and failed-state dimming lower emphasis on purpose; the state is also given in text.
      const opacity = opacityOf(text);
      if (opacity < 0.05) continue;
      const dimmed = opacity < 1;
      const focusDim = dimmed && svg.hasAttribute('data-focus-active');
      if (value < 4.5 && !dimmed) report('diagram', node.getAttribute('data-node-id') + ': ' + text.textContent.trim().slice(0, 30), value, '4.5');
      if (value < 3 && dimmed && !focusDim) report('diagram (dimmed)', node.getAttribute('data-node-id') + ': ' + text.textContent.trim().slice(0, 30), value, '3');
      if (value < 3 && focusDim) focusDimmed += 1;
      const px = parseFloat(s.fontSize) * scale;
      if (smallest == null || px < smallest.px) smallest = { px, text: text.textContent.trim().slice(0, 30) };
    }
    // 10. Tiny diagram labels. Below 6px is unreadable (the inherited gate's floor); below 7.5px is noted.
    if (focusDimmed) add('focus-dimming', 'note', 'the inherited Focus view dims ' + focusDimmed + ' unrelated labels below 3:1 on purpose');
    // On a phone the diagram keeps a 720px minimum width and scrolls sideways (inherited behaviour);
    // labels can be under 6px until the reader zooms. On desktop sizes that is a defect.
    if (smallest && smallest.px < 6) add('unreadable-label', narrow ? 'medium' : 'high', 'smallest diagram label "' + smallest.text + '" renders at ' + smallest.px.toFixed(1) + 'px' + (narrow ? ' at phone width before zooming' : ''));
    else if (smallest && smallest.px < 7.5) add('small-label', 'note', 'smallest diagram label "' + smallest.text + '" renders at ' + smallest.px.toFixed(1) + 'px; zoom is available');
    // 11. Simulation badges must not hide component names.
    const labels = [...svg.querySelectorAll('g[data-node-id] text[data-node-label]')].map((t) => t.getBoundingClientRect());
    for (const badge of svg.querySelectorAll('.workbench-badge')) {
      const b = badge.getBoundingClientRect();
      for (const l of labels) { const area = overlap(b, l); if (area > 0.2 * l.width * l.height) add('overlay-obscures-label', 'high', 'badge "' + badge.textContent + '" covers a component name'); }
    }
  }
  for (const text of lowContrast.values()) add('low-contrast', 'high', text);

  // 12. Missing icons and broken images.
  for (const icon of document.querySelectorAll('.ame-icon, .toolbar-icon, .header .pulse-dot')) {
    if (!visible(icon)) continue;
    const s = getComputedStyle(icon, icon.classList.contains('pulse-dot') ? '::before' : null);
    const mask = s.maskImage || s.webkitMaskImage;
    if (!mask || mask === 'none') add('missing-icon', 'high', icon.className + ' has no image');
  }
  for (const img of document.images) if (img.complete && img.naturalWidth === 0) add('broken-image', 'high', img.src.slice(0, 80));

  // 13. Spacing: the canvas keeps the same margin from the regions on each side.
  // (While the workbench is off the rail is a column of icons inside the page gutter.)
  if (visible(canvas) && !embed && !present && docked && window.ArchiMadeEasy && ArchiMadeEasy.workbench && ArchiMadeEasy.workbench.available && ArchiMadeEasy.workbench.isOn()) {
    const c = rect(canvas); const left = visible(rail) ? rect(rail).right : 0; const right = visible(inspector) ? rect(inspector).left : document.documentElement.clientWidth;
    const gapLeft = c.left - left; const gapRight = right - c.right;
    if (gapLeft < 8 || gapRight < 8) add('inconsistent-spacing', 'medium', 'canvas margin is ' + Math.round(gapLeft) + 'px on the left and ' + Math.round(gapRight) + 'px on the right (minimum 8)');
  }

  // 14. Workbench state consistency.
  const w = window.ArchiMadeEasy && ArchiMadeEasy.workbench;
  if (w && w.available && svg) {
    const marks = svg.querySelectorAll('[data-workbench-overlay], [data-wb-state], [data-wb-edge], [data-wb-fault], [data-wb-lit], [data-wb-pending]').length;
    if (!w.isOn() && marks) add('stale-ui', 'high', marks + ' workbench marks remain on the canvas while the workbench is off');
    if (!w.isOn() && (visible(vitals) || visible(inspector))) add('stale-ui', 'high', 'a workbench region is visible while the workbench is off');
    if (w.isOn() && !visible(vitals) && !present && !embed) add('stale-ui', 'high', 'the workbench is on but the vitals bar is not shown');
    const toggle = q('#btn-workbench');
    if (toggle && toggle.getAttribute('aria-pressed') !== String(w.isOn())) add('stale-ui', 'high', 'the toolbar toggle does not reflect the workbench state');
    if (visible(vitals)) {
      if (!/modelled/i.test(vitals.textContent) || !/not measured/i.test(vitals.textContent)) add('unlabelled-model', 'critical', 'the vitals bar does not say its figures are modelled, not measured');
      const inputs = w.inputs(); const baseline = inputs.multiplier === 1 && inputs.cacheHit === 0 && !Object.keys(inputs.faults.nodes).length && !Object.keys(inputs.faults.edges).length && !Object.keys(inputs.faults.boundaries).length;
      if (!baseline && !vitals.querySelector('[data-workbench-condition]')) add('unlabelled-model', 'critical', 'figures are shown under a changed condition without naming it');
      if (baseline && vitals.querySelector('[data-workbench-condition]')) add('stale-ui', 'high', 'a condition is named while the figures are at baseline');
    }
  }
  return defects;
})()`;

const ERROR_TRAP = `window.__qaErrors = [];
  addEventListener('error', (e) => __qaErrors.push(String(e.message)));
  addEventListener('unhandledrejection', (e) => __qaErrors.push(String(e.reason)));
  (function () { var original = console.error; console.error = function () { __qaErrors.push(Array.prototype.join.call(arguments, ' ')); return original.apply(console, arguments); }; })();`;
const SETTLE = `(async () => {
  const frame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  await document.fonts.ready; await frame();
  if (window.ArchiMadeEasy && ArchiMadeEasy.readerLayout) await ArchiMadeEasy.readerLayout.whenStable().catch(() => {});
  if (window.ArchiMadeEasy && ArchiMadeEasy.viewerChromeLayout) await ArchiMadeEasy.viewerChromeLayout.whenStable().catch(() => {});
  await frame();
})()`;

const W = 'const w = ArchiMadeEasy.workbench;';
const click = (selector) => `document.querySelector(${JSON.stringify(selector)}).click();`;

/**
 * States of the authored architecture. `act` runs in the page; `expect` returns extra
 * defects for that state. `workflow` is the letter in the test matrix.
 */
export const ARCHITECTURE_STATES = [
  { id: 'initial', workflow: 'A', shot: 'all', act: '', expect: `${W} return w.isOn() && !w.isOpen() ? [] : [{ check: 'initial-state', severity: 'high', detail: 'an authored architecture should start with the workbench on and the inspector closed' }];` },
  { id: 'workbench-off', workflow: 'S', act: `${W} w.off();`, expect: `${W} return document.documentElement.hasAttribute('data-workbench') ? [{ check: 'stale-ui', severity: 'high', detail: 'data-workbench remains after turning off' }] : [];` },
  { id: 'explore-component', workflow: 'D', shot: 'desktop', act: `${click('[data-workbench-mode="explore"]')} ${W} w.select('app');`,
    expect: `${W} const body = document.getElementById('workbench-body').textContent; const out = []; if (!/ECS Fargate/.test(body) || !/Depends on \\(3\\)/.test(body) || !/Called by \\(1\\)/.test(body)) out.push({ check: 'inspector-content', severity: 'high', detail: 'Explore does not show the selected component and its dependencies' }); const node = w.model().nodes.find((n) => n.id === 'app'); const keys = ['role', 'redundancy', 'sla_percent', 'capacity.max_rps', 'latency.p99_ms']; const assumed = keys.filter((k) => node.basis[k] === 'assumed').length; const shownAssumed = document.querySelectorAll('#workbench-body .ame-kv .ame-tag--assumed').length; const shownAuthored = document.querySelectorAll('#workbench-body .ame-kv .ame-tag--authored').length; if (shownAssumed !== assumed || shownAuthored < 1) out.push({ check: 'unlabelled-model', severity: 'critical', detail: 'Explore tags ' + shownAssumed + ' inputs as assumed; the model has ' + assumed }); return out;` },
  { id: 'review-finding', workflow: 'J', shot: 'desktop', act: `${click('[data-workbench-mode="review"]')} ${click('[data-workbench-finding]')}`,
    expect: `${W} const f = w.review().findings.find((x) => x.id === w.state().finding); const svg = document.querySelector('.diagram-container > svg'); const lit = [...svg.querySelectorAll('g[data-wb-lit]')].map((n) => n.getAttribute('data-node-id')).sort(); const out = []; if (!f || JSON.stringify(lit) !== JSON.stringify(f.affectedNodes)) out.push({ check: 'selection-highlight', severity: 'high', detail: 'spotlight ' + JSON.stringify(lit) + ' does not match the finding ' + JSON.stringify(f && f.affectedNodes) }); const detail = document.querySelector('[data-workbench-finding-detail]'); for (const part of ['Problem', 'Evidence', 'Consequence', 'Recommended change']) if (!detail || !detail.textContent.includes(part)) out.push({ check: 'finding-content', severity: 'high', detail: 'finding detail lacks "' + part + '"' }); return out;` },
  { id: 'simulate-setup', workflow: 'F', shot: 'desktop', act: `${click('[data-workbench-mode="simulate"]')} ${click('[data-workbench-scenario="a"]')}`,
    expect: `${W} const svg = document.querySelector('.diagram-container > svg'); return svg.querySelectorAll('[data-wb-state]').length ? [{ check: 'premature-failure', severity: 'critical', detail: 'components are shown as failing before the scenario is run' }] : [];` },
  { id: 'simulate-ran', workflow: 'F', shot: 'all', act: `${click('[data-workbench-mode="simulate"]')} ${click('[data-workbench-scenario="a"]')} ${click('[data-workbench-run]')}`,
    expect: `${W} const out = []; const svg = document.querySelector('.diagram-container > svg'); const result = w.result(); const failing = Object.keys(result.nodes).filter((id) => result.nodes[id].state === 'failing').sort(); const shown = [...svg.querySelectorAll('g[data-wb-state="failing"]')].map((n) => n.getAttribute('data-node-id')).sort(); if (JSON.stringify(failing) !== JSON.stringify(shown)) out.push({ check: 'simulation-state', severity: 'critical', detail: 'canvas shows ' + JSON.stringify(shown) + ' failing; the model says ' + JSON.stringify(failing) }); const availability = document.querySelector('[data-readout="availability"]').textContent; if (!/healthy:/.test(availability)) out.push({ check: 'unlabelled-model', severity: 'critical', detail: 'availability under a fault does not show the healthy value: ' + availability }); if (!document.querySelector('[data-workbench-impact]') || !document.querySelector('[data-workbench-option]')) out.push({ check: 'simulation-content', severity: 'high', detail: 'impact or recovery options are missing after a run' }); return out;` },
  { id: 'simulate-recovery', workflow: 'F', shot: 'desktop', act: `${click('[data-workbench-mode="simulate"]')} ${click('[data-workbench-scenario="a"]')} ${click('[data-workbench-run]')} ${click('[data-workbench-option]')} ${click('[data-workbench-view="option"]')}`,
    expect: `const svg = document.querySelector('.diagram-container > svg'); return svg.querySelectorAll('g[data-wb-state="recovered"]').length ? [] : [{ check: 'simulation-state', severity: 'high', detail: 'the recovery view shows no recovered component' }];` },
  { id: 'simulate-reset', workflow: 'S', act: `${click('[data-workbench-mode="simulate"]')} ${click('[data-workbench-scenario="b"]')} ${click('[data-workbench-run]')} ${click('[data-workbench-reset]')}`,
    expect: `${W} const svg = document.querySelector('.diagram-container > svg'); const out = []; if (svg.querySelectorAll('[data-wb-state], [data-wb-edge], [data-wb-fault], .workbench-badge').length) out.push({ check: 'stale-ui', severity: 'high', detail: 'fault marks remain after Reset' }); if (JSON.stringify(w.figures()) !== JSON.stringify(w.baseline())) out.push({ check: 'stale-ui', severity: 'high', detail: 'figures did not return to baseline after Reset' }); return out;` },
  { id: 'security', workflow: 'H', shot: 'desktop', act: click('[data-workbench-mode="security"]'), expect: `return document.querySelectorAll('.diagram-container .workbench-badge').length ? [] : [{ check: 'mode-content', severity: 'high', detail: 'Security shows no badge on the canvas' }];` },
  { id: 'performance-10x', workflow: 'G', shot: 'desktop', act: `${click('[data-workbench-mode="performance"]')} ${W} w.setLoad(10, 0);`,
    expect: `${W} return w.inputs().multiplier === 10 && /10x load/.test(document.getElementById('workbench-vitals').textContent) ? [] : [{ check: 'mode-content', severity: 'high', detail: 'Performance at 10x does not name its condition' }];` },
  { id: 'finops', workflow: 'I', shot: 'desktop', act: click('[data-workbench-mode="finops"]'), expect: `return /incomplete|covering/.test(document.getElementById('workbench-body').textContent) ? [] : [{ check: 'mode-content', severity: 'high', detail: 'FinOps does not state cost coverage' }];` },
  { id: 'optimize-change', workflow: 'J', shot: 'desktop', act: `${click('[data-workbench-mode="optimize"]')} ${click('[data-workbench-change]')}`, expect: `return document.querySelector('[data-workbench-change-detail] table') ? [] : [{ check: 'mode-content', severity: 'high', detail: 'Optimize shows no preview for the selected change' }];` },
  { id: 'decide-trace', workflow: 'K', shot: 'desktop', act: `${click('[data-workbench-mode="decide"]')} ${click('[data-workbench-trace="next"]')}`, expect: `const svg = document.querySelector('.diagram-container > svg'); return svg.querySelector('[data-wb-edge="trace-current"]') ? [] : [{ check: 'mode-content', severity: 'high', detail: 'the trace step is not marked on the canvas' }];` },
  { id: 'handoff', workflow: 'M', act: click('[data-workbench-mode="handoff"]'), expect: `return document.querySelectorAll('[data-workbench-export]').length === 4 ? [] : [{ check: 'mode-content', severity: 'high', detail: 'Handoff does not offer four formats' }];` },
  { id: 'inspector-collapsed', workflow: 'E', act: `${click('[data-workbench-mode="review"]')} ${click('[data-workbench-mode="review"]')}`, expect: `${W} return w.isOn() && !w.isOpen() ? [] : [{ check: 'mode-switch', severity: 'high', detail: 'choosing the current mode again did not collapse the inspector' }];` },
  { id: 'inherited-focus', workflow: 'D', act: `${W} w.off(); ArchiMadeEasy.focus.set('app', { toggle: false, updateUrl: false });`, expect: `const chip = document.querySelector('.focus-chip'); return chip && getComputedStyle(chip).display !== 'none' ? [] : [{ check: 'inherited-feature', severity: 'high', detail: 'the inherited component passport does not open with the workbench off' }];` },
  { id: 'inherited-search', workflow: 'C', act: `${W} w.off(); ${click('#btn-node-finder')}`, expect: `const finder = document.getElementById('node-finder'); return finder && getComputedStyle(finder).display !== 'none' ? [] : [{ check: 'inherited-feature', severity: 'high', detail: 'search does not open' }];` },
  { id: 'inherited-zoom', workflow: 'C', act: `ArchiMadeEasy.view.zoomIn(); ArchiMadeEasy.view.zoomIn();`, expect: `return [];` },
  { id: 'export-menu', workflow: 'M', act: click('#btn-export'), expect: `const menu = document.getElementById('export-menu'); const r = menu.getBoundingClientRect(); return r.width > 0 && r.right <= innerWidth + 1 && r.left >= -1 ? [] : [{ check: 'off-screen-control', severity: 'high', detail: 'the export menu is not fully on screen' }];` },
  { id: 'keyboard-rail', workflow: 'P', act: `document.querySelector('[data-workbench-mode="simulate"]').focus(); document.activeElement.click();`,
    expect: `${W} const out = []; if (!w.isOpen() || w.state().mode !== 'simulate') out.push({ check: 'keyboard', severity: 'high', detail: 'activating a focused rail button did not open its mode' }); const body = document.getElementById('workbench-body'); body.focus(); body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); if (w.isOpen()) out.push({ check: 'keyboard', severity: 'high', detail: 'Escape in the inspector did not collapse it' }); if (document.activeElement !== document.querySelector('[data-workbench-mode="simulate"]')) out.push({ check: 'keyboard', severity: 'medium', detail: 'focus did not return to the mode button after Escape' }); return out;` },
];
// States every flagship example goes through. `scenario` is the preset its simulation runs;
// `finding` says whether its review has a finding to open.
const flagshipStates = ({ simulate, scenario, finding = true }) => [
  { id: 'initial', workflow: 'A', shot: 'all', act: '', expect: `${W} return w.isOn() && !w.isOpen() ? [] : [{ check: 'initial-state', severity: 'high', detail: 'a flagship example should start with the workbench on and the inspector closed' }];` },
  finding
    ? { id: 'review-finding', workflow: 'J', shot: 'desktop', act: `${click('[data-workbench-mode="review"]')} ${click('[data-workbench-finding]')}`, expect: `return document.querySelector('[data-workbench-finding-detail]') ? [] : [{ check: 'mode-content', severity: 'high', detail: 'no finding detail' }];` }
    : { id: 'review-clean', workflow: 'J', shot: 'desktop', act: click('[data-workbench-mode="review"]'), expect: `${W} return w.review().findings.length === 0 && /No rule fired/.test(document.getElementById('workbench-body').textContent) ? [] : [{ check: 'mode-content', severity: 'high', detail: 'a review without findings does not say what that means' }];` },
  { id: simulate, workflow: 'F', shot: 'all', act: `${click('[data-workbench-mode="simulate"]')} ${click(`[data-workbench-scenario="${scenario}"]`)} ${click('[data-workbench-run]')}`, expect: `${W} const k = w.result().kpis; return k.blast_radius.nodes.length ? [] : [{ check: 'simulation-state', severity: 'high', detail: 'the scenario affects no component' }];` },
  { id: 'performance-10x', workflow: 'G', shot: 'desktop', act: `${click('[data-workbench-mode="performance"]')} ${W} w.setLoad(10, 0);`, expect: 'return [];' },
  { id: 'decide-trace', workflow: 'K', shot: 'desktop', act: `${click('[data-workbench-mode="decide"]')} ${click('[data-workbench-trace="next"]')}`, expect: 'return [];' },
];
const FLAGSHIP_STATES = flagshipStates({ simulate: 'simulate-region-loss', scenario: 'b' });
// Levels: a component opens into its own diagram, carried in the page (workflow L).
const LEVEL_READY = "await new Promise((resolve, reject) => { const started = Date.now(); (function poll() { const level = ArchiMadeEasy.workbench.level(); if (level && level.ready) resolve(); else if (Date.now() - started > 20000) reject(new Error('the level did not report ready')); else setTimeout(poll, 50); })(); });";
export const LEVEL_STATES = [
  { id: 'levels-explore', workflow: 'L', shot: 'desktop', act: click('[data-workbench-mode="explore"]'),
    expect: `${W} const marks = document.querySelectorAll('.diagram-container .workbench-badge--level').length; const cards = document.querySelectorAll('#workbench-body .ame-card[data-workbench-level]').length; return marks > 0 && marks === w.levels().length && cards === marks ? [] : [{ check: 'level-content', severity: 'high', detail: 'Explore lists ' + cards + ' levels and marks ' + marks + '; the page carries ' + w.levels().length }];` },
  { id: 'level-open', workflow: 'L', shot: 'all', act: `${W} w.openLevel('checkout-service'); ${LEVEL_READY} await new Promise((resolve) => setTimeout(resolve, 1200));`,
    expect: `${W} const out = []; const level = w.level(); const frame = document.querySelector('.ame-level-frame').getBoundingClientRect(); const bar = document.querySelector('.ame-level-bar').getBoundingClientRect(); if (!level.report.workbench || level.report.nodes < 2) out.push({ check: 'level-content', severity: 'critical', detail: 'the child page did not start its workbench' }); if (level.report.theme !== document.documentElement.getAttribute('data-theme')) out.push({ check: 'level-content', severity: 'high', detail: 'the child page does not follow the theme' }); if (Math.abs(frame.top - bar.bottom) > 1 || Math.abs(frame.bottom - innerHeight) > 1 || Math.abs(frame.width - innerWidth) > 1) out.push({ check: 'level-layout', severity: 'high', detail: 'the child page does not fill the window under the bar' }); return out;` },
  { id: 'level-closed', workflow: 'L', act: `${W} w.openLevel('catalog-service'); ${LEVEL_READY} w.closeLevel();`,
    expect: `${W} return document.getElementById('workbench-level') || document.documentElement.hasAttribute('data-ame-level') || [...document.body.children].some((e) => e.inert) || w.level() ? [{ check: 'stale-ui', severity: 'high', detail: 'the level view left something behind after Back' }] : [];` },
];
// A child diagram on its own: the page a level opens.
const CHILD_STATES = flagshipStates({ simulate: 'simulate-store-outage', scenario: 'a', finding: false }).filter((s) => s.id !== 'decide-trace').map((s) => ({ ...s, workflow: 'L', shot: s.id === 'initial' ? 'desktop' : false }));
const SIMPLE_STATES = [
  { id: 'initial', workflow: 'T', shot: 'all', act: '', expect: 'return [];' },
  { id: 'export-menu', workflow: 'M', act: click('#btn-export'), expect: 'return [];' },
];

function renderFixtures(directory) {
  const write = (name, document) => { const file = path.join(directory, `${name}.architecture.json`); fs.writeFileSync(file, JSON.stringify(document)); return file; };
  const render = (type, input, name) => {
    const output = path.join(directory, `${name}.html`);
    execFileSync(process.execPath, [path.join(skillRoot, `renderers/${type}/render-${type}.mjs`), input, output], { stdio: ['ignore', 'ignore', 'pipe'] });
    return output;
  };
  return {
    'web-ha': render('architecture', write('web-ha', authoredWebHa()), 'web-ha'),
    'long-labels': render('architecture', write('long-labels', longLabelWebHa()), 'long-labels'),
    dense: render('architecture', write('dense', denseMicroservices()), 'dense'),
    'web-app': render('architecture', path.join(skillRoot, 'examples', 'web-app.architecture.json'), 'web-app'),
    fintech: render('architecture', path.join(skillRoot, 'examples', 'global-fintech-payment-mesh.architecture.json'), 'fintech'),
    'ai-platform': render('architecture', path.join(skillRoot, 'examples', 'enterprise-agentic-ai-platform.architecture.json'), 'ai-platform'),
    'ecommerce-c4': render('architecture', path.join(skillRoot, 'examples', 'cloud-native-ecommerce-c4.architecture.json'), 'ecommerce-c4'),
    // Each child diagram of the C4 example, as the page of its own that a level opens.
    ...Object.fromEntries(JSON.parse(fs.readFileSync(path.join(skillRoot, 'examples', 'cloud-native-ecommerce-c4.architecture.json'), 'utf8')).workbench.drilldowns
      .map((drilldown) => [`c4-${drilldown.id}`, render('architecture', write(`c4-${drilldown.id}`, drilldown.spec), `c4-${drilldown.id}`)])),
    workflow: render('workflow', path.join(skillRoot, 'examples', 'agent-tool-call.workflow.json'), 'workflow'),
    sequence: render('sequence', path.join(skillRoot, 'examples', 'cache-miss-request.sequence.json'), 'sequence'),
  };
}

/**
 * Run the matrix.
 * @returns {{ states: number, defects: object[], notes: object[], screenshots: string[], comparisons: object[] }}
 */
export async function runVisualQa({ chromePath = findChrome(), viewports = VIEWPORTS, themes = THEMES, shots = false, compare = false, shotDirectory = path.join(repoRoot, 'docs', 'visual-qa', 'archi-made-easy-after'), log = () => {} } = {}) {
  if (!chromePath) throw new Error('Visual QA needs Chrome, Chromium or Edge. Set ARCHI_MADE_EASY_CHROME to its path.');
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'archi-made-easy-visual-qa-'));
  const files = renderFixtures(scratch);
  const browser = new ChromeVisualBrowser(chromePath);
  const defects = []; const notes = []; const screenshots = []; const comparisons = [];
  let states = 0;
  try {
    const session = await browser.sessionPromise;
    const send = (method, params = {}) => browser.cdp.send(method, params, session);
    await browser.cdp.send('Browser.setDownloadBehavior', { behavior: 'deny' });
    await send('Page.addScriptToEvaluateOnNewDocument', { source: ERROR_TRAP });
    const evaluate = async (expression) => {
      const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result?.value;
    };
    const plan = [
      ['web-ha', ARCHITECTURE_STATES, viewports],
      ['long-labels', ARCHITECTURE_STATES.filter((s) => ['initial', 'simulate-ran', 'review-finding'].includes(s.id)).map((s) => ({ ...s, workflow: 'Q', shot: s.id === 'initial' ? 'desktop' : false })), viewports],
      ['dense', ARCHITECTURE_STATES.filter((s) => ['simulate-ran', 'review-finding', 'performance-10x'].includes(s.id)).map((s) => ({ ...s, workflow: 'Q', expect: 'return [];', shot: s.id === 'simulate-ran' ? 'desktop' : false })), viewports],
      ['web-app', [{ id: 'initial', workflow: 'T', shot: 'desktop', act: '', expect: `const w = ArchiMadeEasy.workbench; return w.available && !w.isOn() ? [] : [{ check: 'initial-state', severity: 'high', detail: 'an inherited architecture must start with the workbench off' }];` },
        { id: 'open-review', workflow: 'E', act: click('[data-workbench-mode="review"]'), expect: 'return [];' }], viewports],
      // Flagship examples: the same states, with the checks that do not depend on one document.
      ['fintech', FLAGSHIP_STATES, viewports],
      ['ai-platform', flagshipStates({ simulate: 'simulate-provider-brownout', scenario: 'd' }), viewports],
      ['ecommerce-c4', [...flagshipStates({ simulate: 'simulate-region-loss', scenario: 'b', finding: false }), ...LEVEL_STATES], viewports],
      ...['c4-catalog-service', 'c4-checkout-service', 'c4-fulfilment-service'].map((name) => [name, CHILD_STATES, viewports]),
      ['workflow', SIMPLE_STATES, viewports],
      ['sequence', SIMPLE_STATES, viewports],
    ];
    for (const [name, list, sizes] of plan) {
      for (const [width, height] of sizes) {
        for (const theme of themes) {
          await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
          await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: theme }, { name: 'prefers-reduced-motion', value: 'reduce' }] });
          for (const state of list) {
            const where = { document: name, state: state.id, workflow: state.workflow, viewport: `${width}x${height}`, theme };
            const loaded = browser.cdp.waitFor('Page.loadEventFired', session);
            await send('Page.navigate', { url: `${pathToFileURL(files[name]).href}?theme=${theme}` });
            await loaded;
            await evaluate(SETTLE);
            let found = [];
            try {
              if (state.act) await evaluate(`(async () => { ${state.act} })()`);
              await evaluate(SETTLE);
              found = await evaluate(COMMON_CHECKS);
              found = found.concat(await evaluate(`(() => { ${state.expect} })()`));
              for (const message of await evaluate('window.__qaErrors')) found.push({ check: 'runtime-error', severity: 'critical', detail: message });
            } catch (error) {
              found.push({ check: 'runtime-error', severity: 'critical', detail: String(error.message).split('\n')[0] });
            }
            states += 1;
            for (const defect of found) (defect.severity === 'note' ? notes : defects).push({ ...where, ...defect });
            const wantShot = state.shot === 'all' || (state.shot === 'desktop' && width === 1440);
            if ((shots || compare) && wantShot) {
              const capture = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
              const file = path.join(shotDirectory, `${name}-${width}x${height}-${theme}-${state.id}.png`);
              if (compare && fs.existsSync(file)) {
                const reference = fs.readFileSync(file).toString('base64');
                const diff = await evaluate(`(async () => {
                  const load = (data) => new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = 'data:image/png;base64,' + data; });
                  const [a, b] = await Promise.all([load(${JSON.stringify(reference)}), load(${JSON.stringify(capture.data)})]);
                  if (a.width !== b.width || a.height !== b.height) return { changed: 1, size: [a.width, a.height, b.width, b.height] };
                  const pixels = (image) => { const c = document.createElement('canvas'); c.width = image.width; c.height = image.height; const x = c.getContext('2d'); x.drawImage(image, 0, 0); return x.getImageData(0, 0, c.width, c.height).data; };
                  const pa = pixels(a); const pb = pixels(b); let different = 0;
                  for (let i = 0; i < pa.length; i += 4) if (Math.abs(pa[i] - pb[i]) > 24 || Math.abs(pa[i + 1] - pb[i + 1]) > 24 || Math.abs(pa[i + 2] - pb[i + 2]) > 24) different += 1;
                  return { changed: different / (pa.length / 4) };
                })()`);
                comparisons.push({ ...where, file: path.basename(file), changed: diff.changed });
                // More than 1% of pixels differing by a visible amount is a regression to look at.
                if (diff.changed > 0.01) defects.push({ ...where, check: 'visual-regression', severity: 'high', detail: `${(diff.changed * 100).toFixed(2)}% of pixels differ from ${path.basename(file)}` });
              }
              if (shots) { fs.mkdirSync(shotDirectory, { recursive: true }); fs.writeFileSync(file, Buffer.from(capture.data, 'base64')); screenshots.push(path.basename(file)); }
            }
          }
          log(`${name} ${width}x${height} ${theme}: ${list.length} states`);
        }
      }
    }
  } finally {
    await browser.close();
    fs.rmSync(scratch, { recursive: true, force: true });
  }
  return { states, defects, notes, screenshots, comparisons };
}

/** One line per distinct defect, with how often and where it occurred. */
export function summarise(defects) {
  const groups = new Map();
  for (const defect of defects) {
    const key = `${defect.severity}|${defect.check}|${defect.detail}`;
    const group = groups.get(key) || { severity: defect.severity, check: defect.check, detail: defect.detail, count: 0, where: new Set() };
    group.count += 1; group.where.add(`${defect.document}/${defect.state} ${defect.viewport} ${defect.theme}`);
    groups.set(key, group);
  }
  const order = { critical: 0, high: 1, medium: 2, low: 3, note: 4 };
  return [...groups.values()].sort((a, b) => (order[a.severity] - order[b.severity]) || (b.count - a.count))
    .map((g) => ({ severity: g.severity, check: g.check, detail: g.detail, count: g.count, examples: [...g.where].slice(0, 3) }));
}

if (process.argv[1] && sameEntry(process.argv[1], fileURLToPath(import.meta.url)).status === 'match') {
  const flags = new Set(process.argv.slice(2));
  const quick = flags.has('--quick');
  const started = Date.now();
  const result = await runVisualQa({
    shots: flags.has('--shots'), compare: flags.has('--compare'),
    viewports: quick ? [[1440, 900], [390, 844]] : VIEWPORTS, themes: quick ? ['light'] : THEMES,
    log: (line) => console.error(line),
  });
  const summary = summarise(result.defects);
  const blocking = summary.filter((d) => d.severity === 'critical' || d.severity === 'high');
  const report = {
    generated: new Date().toISOString().slice(0, 10),
    scope: quick ? 'quick' : 'full',
    states: result.states,
    seconds: Math.round((Date.now() - started) / 1000),
    defects: { critical: summary.filter((d) => d.severity === 'critical').length, high: summary.filter((d) => d.severity === 'high').length, medium: summary.filter((d) => d.severity === 'medium').length },
    distinctDefects: summary,
    notes: summarise(result.notes),
    screenshots: result.screenshots.length,
    comparisons: result.comparisons.length ? { compared: result.comparisons.length, worst: Math.max(...result.comparisons.map((c) => c.changed)) } : null,
  };
  if (!quick) fs.writeFileSync(path.join(repoRoot, 'docs', 'visual-qa', 'automated-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = blocking.length ? 1 : 0;
}
