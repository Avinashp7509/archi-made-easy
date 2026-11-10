// Shared card styling for the architecture and workflow renderers. Every
// preset gets the cleaner cards and label chips; blueprint keeps its drafting
// dash patterns and square corners.
const TONES = ['frontend', 'backend', 'database', 'cloud', 'security', 'messagebus', 'external'];

export const NODE_CARD_ATTR = 'data-node-ui=""';

/**
 * The category accent of a component card: a short bar inside the left edge. It is a path,
 * not a rect, so rules that style a node's rectangles (focus, selection, fault state) leave
 * it alone. `tone` is the node's category (frontend, backend, ...).
 */
export function nodeAccent(tone, { x, y, height }) {
  const inset = Math.min(9, Math.max(5, height / 4));
  return `<path data-graph-role="node-accent" aria-hidden="true" class="node-accent k-${tone}" d="M ${x + 3} ${y + inset} V ${y + height - inset}" fill="none" stroke-width="3" stroke-linecap="round" pointer-events="none"/>`;
}

export function nodeCardStyle() {
  const all = 'svg[data-node-ui]';
  const solid = `${all}:is([data-preset="classic"], [data-preset="signal-flow"], [data-preset="editorial"])`;
  const blueprint = `${all}[data-preset="blueprint"]`;
  const editorial = `${all}[data-preset="editorial"]`;
  const dark = `:is([data-theme="dark"] ${all}, ${all}[data-theme="dark"])`;
  const node = '[data-node-id] > rect:not(.c-mask)';
  const frameLabel = '[data-graph-role="structural-frame-label-mask"]';
  const edgeLabel = 'g[data-edge-from] > rect.c-mask';
  return `        <style>
          ${all} ${node} { stroke-width: 1px; }
${TONES.map((tone) => `          ${all} ${node}.c-${tone} { fill: color-mix(in srgb, var(--${tone}-stroke) 5%, var(--mask)); stroke: color-mix(in srgb, var(--${tone}-stroke) 36%, var(--lane-stroke)); }`).join('\n')}
${TONES.map((tone) => `          ${all} .node-accent.k-${tone} { stroke: var(--${tone}-stroke); }`).join('\n')}
${TONES.map((tone) => `          ${dark} ${node}.c-${tone} { fill: color-mix(in srgb, var(--${tone}-stroke) 8%, var(--mask)); stroke: color-mix(in srgb, var(--${tone}-stroke) 42%, var(--lane-stroke)); }`).join('\n')}
          ${solid} .c-region { fill: color-mix(in srgb, var(--cloud-stroke) 3%, transparent); stroke: color-mix(in srgb, var(--cloud-stroke) 42%, var(--lane-stroke)); stroke-dasharray: none; }
          ${all} .c-security-group { stroke: color-mix(in srgb, var(--security-stroke) 58%, var(--lane-stroke)); }
          ${solid} .c-security-group { stroke-dasharray: 4 3; }
          ${solid} .c-lane { stroke: var(--lane-stroke); stroke-dasharray: none; }
          ${all} ${frameLabel} { rx: 5px; fill: color-mix(in srgb, var(--cloud-stroke) 10%, var(--mask)); stroke: color-mix(in srgb, var(--cloud-stroke) 38%, var(--mask)); stroke-width: .8px; }
          ${all} [data-composition-frame-kind="security-group"] > ${frameLabel} { fill: color-mix(in srgb, var(--security-stroke) 9%, var(--mask)); stroke: color-mix(in srgb, var(--security-stroke) 36%, var(--mask)); }
          ${all} .phase-rule { opacity: .5; stroke-dasharray: none; }
          ${all} .phase-chip { stroke: var(--lane-stroke); stroke-width: .75px; }
          ${all} ${edgeLabel} { rx: 7px; stroke: var(--lane-stroke); stroke-width: .75px; }
          ${blueprint} :is(${frameLabel}, ${edgeLabel}, .phase-chip) { rx: 2px; }
          ${editorial} :is(${frameLabel}, ${edgeLabel}, .phase-chip) { rx: 3px; }
        </style>`;
}
