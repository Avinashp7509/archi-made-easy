// Data the architecture renderer embeds in the HTML for the in-page workbench: the parts
// of the document the model reads, and nothing else, so the page and the command line
// build the same model (test/workbench-embed.test.mjs holds them equal). Repository
// evidence and routing hints stay out; child diagrams are listed by id and title only.

import { brandName } from './defaults.mjs';

export const WORKBENCH_DATA_VERSION = 1;

const pick = (source, keys) => Object.fromEntries(keys.filter((key) => source[key] !== undefined).map((key) => [key, source[key]]));

/** @returns {{ schemaVersion: number, document: object }} */
export function buildWorkbenchData(document) {
  const workbench = document.workbench ? { ...document.workbench } : undefined;
  if (workbench?.drilldowns) workbench.drilldowns = workbench.drilldowns.map(({ id, title }) => ({ id, ...(title ? { title } : {}) }));
  const assumptions = (document.cards || []).filter((card) => card.title === 'Assumptions');
  return {
    schemaVersion: WORKBENCH_DATA_VERSION,
    document: {
      schema_version: document.schema_version,
      diagram_type: 'architecture',
      meta: { title: document.meta?.title ?? '' },
      ...(document.layout ? { layout: { ...document.layout } } : {}),
      components: (document.components || []).map((component) => ({
        ...pick(component, ['id', 'type', 'label', 'sublabel', 'tag', 'row', 'col', 'pos', 'size', 'operational']),
        // Only a catalog brand name travels: it is a role hint. Image addresses and icons do not.
        ...(brandName(component.brand) ? { brand: brandName(component.brand) } : {}),
      })),
      ...(document.boundaries ? { boundaries: document.boundaries.map((boundary) => pick(boundary, ['id', 'kind', 'label', 'wraps', 'operational'])) } : {}),
      connections: (document.connections || []).map((connection) => pick(connection, ['id', 'from', 'to', 'label', 'operational'])),
      ...(assumptions.length ? { cards: assumptions } : {}),
      ...(workbench ? { workbench } : {}),
    },
  };
}
