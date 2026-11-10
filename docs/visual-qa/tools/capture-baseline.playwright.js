// Baseline capture, run through the Playwright MCP tool (browser_run_code, filename mode).
// It photographs the upstream viewer and the pre-redesign Archi-Made-Easy viewer at the
// same viewports and in the same states, and records computed facts about each page.
//
// Pages are served from a scratch directory on 127.0.0.1:8766 (see README.md in this
// folder for how they are rendered). Nothing here writes into the upstream checkout.
async (page) => {
  const BASE = 'http://127.0.0.1:8766/';
  // The tool's sandbox has no file-system module: screenshots are written by Playwright
  // itself, and the observations are returned to the caller, who saves them.
  const OUT = '/ABSOLUTE/PATH/TO/archi-made-easy/docs/visual-qa';
  const VIEWPORTS = [[1920, 1080], [1440, 900], [1366, 768], [1280, 800], [768, 1024], [390, 844]];
  const SETS = [
    { dir: 'upstream-baseline', prefix: 'up', namespace: 'Archify' },
    { dir: 'archi-made-easy-before', prefix: 'before', namespace: 'ArchiMadeEasy' },
  ];
  const log = [];
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error.message)));
  page.on('console', (message) => { if (message.type() === 'error' && !/favicon/.test(message.text())) errors.push(message.text()); });

  async function open(file, theme, width, height, query = '') {
    await page.setViewportSize({ width, height });
    await page.goto(`${BASE}${file}?theme=${theme}${query}`, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(700); // reader layout and entrance motion settle
    await page.evaluate(() => window.scrollTo(0, 0));
  }
  async function shot(set, name) {
    const file = `${OUT}/${set.dir}/${name}.png`;
    await page.screenshot({ path: file, scale: 'css', type: 'png' });
    log.push(`${set.dir}/${name}.png`);
  }
  // Facts read from the live page, so the audit can separate what was observed from
  // what was only read in the source.
  const facts = () => page.evaluate(() => {
    const rect = (selector) => { const el = document.querySelector(selector); if (!el) return null; const r = el.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]; };
    const style = (selector, props) => { const el = document.querySelector(selector); if (!el) return null; const cs = getComputedStyle(el); return Object.fromEntries(props.map((p) => [p, cs.getPropertyValue(p)])); };
    const root = getComputedStyle(document.documentElement);
    const tokens = ['--bg', '--panel', '--panel-border', '--text', '--text-muted', '--frontend-stroke', '--backend-stroke', '--database-stroke', '--cloud-stroke', '--security-stroke', '--messagebus-stroke', '--external-stroke', '--arrow', '--arrow-emphasis'];
    return {
      viewport: [innerWidth, innerHeight],
      scroll: [document.documentElement.scrollWidth, document.documentElement.scrollHeight],
      theme: document.documentElement.getAttribute('data-theme'),
      preset: document.documentElement.getAttribute('data-preset'),
      readerRail: document.documentElement.getAttribute('data-reader-rail'),
      tokens: Object.fromEntries(tokens.map((t) => [t, root.getPropertyValue(t).trim()])),
      body: style('body', ['font-family', 'font-size', 'background-color', 'padding-top', 'padding-left']),
      title: style('h1', ['font-family', 'font-size', 'font-weight', 'letter-spacing']),
      nodeLabel: style('svg [data-node-id] text', ['font-family', 'font-size', 'font-weight']),
      rects: {
        toolbar: rect('.toolbar'), header: rect('.header'), container: rect('.container'), diagram: rect('.diagram-container'),
        svg: rect('.diagram-container > svg'), legend: rect('svg [data-legend]'), nav: rect('.diagram-nav'), cards: rect('.cards'),
        outline: rect('#node-outline'), workbench: rect('#workbench'),
      },
      toolbarButtons: [...document.querySelectorAll('.toolbar button')].filter((b) => b.offsetParent && !b.closest('[role="menu"]')).map((b) => (b.getAttribute('aria-label') || b.textContent).trim()),
      navButtons: [...document.querySelectorAll('.diagram-nav button')].filter((b) => b.offsetParent).map((b) => (b.getAttribute('aria-label') || b.textContent).trim()),
      nodeCount: document.querySelectorAll('svg [data-node-id]').length,
      edgeCount: document.querySelectorAll('svg path[data-edge-key]').length,
    };
  });

  const observations = {};
  for (const set of SETS) {
    observations[set.dir] = {};
    const arch = `${set.prefix}-web-ha.html`;
    // 1. Initial state, six viewports, both themes.
    for (const [width, height] of VIEWPORTS) {
      for (const theme of ['light', 'dark']) {
        await open(arch, theme, width, height);
        await shot(set, `web-ha-${width}x${height}-${theme}-initial`);
        if (theme === 'light' && [1920, 1440, 390].includes(width)) observations[set.dir][`${width}x${height}`] = await facts();
      }
    }
    // 2. Other examples and inherited diagram types at the standard laptop size.
    for (const name of ['web-app', 'workflow', 'sequence']) {
      for (const theme of ['light', 'dark']) {
        await open(`${set.prefix}-${name}.html`, theme, 1440, 900);
        await shot(set, `${name}-1440x900-${theme}-initial`);
      }
    }
    // 3. Interaction states at 1440 x 900, dark (the default theme of both products).
    const states = [
      ['hover-node', async () => { await page.hover('[data-node-id="app"] rect:not(.c-mask)'); await page.waitForTimeout(500); }],
      ['focus-node-inspector', async () => { await page.click('[data-node-id="app"] rect:not(.c-mask)'); await page.waitForTimeout(700); }],
      ['search', async () => { await page.click('#btn-node-finder'); await page.waitForTimeout(400); await page.keyboard.type('a'); await page.waitForTimeout(400); }],
      ['export-menu', async () => { await page.click('#btn-export'); await page.waitForTimeout(400); }],
      ['style-menu', async () => { await page.click('#btn-preset'); await page.waitForTimeout(400); }],
      ['guide', async () => { await page.click('#btn-diagram-guide'); await page.waitForTimeout(400); }],
      ['lens', async () => { await page.click('#btn-semantic-lens'); await page.waitForTimeout(500); }],
      ['route', async () => { await page.click('#btn-route-probe'); await page.waitForTimeout(400); }],
      ['zoom-in', async () => { await page.click('.diagram-nav [data-view="in"]'); await page.click('.diagram-nav [data-view="in"]'); await page.waitForTimeout(600); }],
      ['present', async () => { await page.click('#btn-present'); await page.waitForTimeout(600); }],
    ];
    for (const [name, act] of states) {
      // The pre-redesign workbench opens by itself on this document; the comparison of
      // inherited interactions is made with it closed.
      await open(arch, 'dark', 1440, 900, set.prefix === 'before' ? '&embed=0' : '');
      if (set.prefix === 'before') await page.evaluate(() => window.ArchiMadeEasy.workbench.close());
      try { await act(); await shot(set, `web-ha-1440x900-dark-${name}`); } catch (error) { errors.push(`${set.dir} ${name}: ${error.message}`); }
    }
    // 4. Page bottom (notes and index) at 1440 x 900.
    await open(arch, 'light', 1440, 900);
    if (set.prefix === 'before') await page.evaluate(() => window.ArchiMadeEasy.workbench.close());
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(400);
    await shot(set, 'web-ha-1440x900-light-notes-and-index');
  }

  // 5. The pre-redesign workbench (bottom dock) in its states.
  const before = SETS[1];
  const workbench = [
    ['workbench-open', async () => {}],
    ['workbench-fault-db-down', async () => { await page.evaluate(() => { const w = window.ArchiMadeEasy.workbench; w.setMode('chaos'); w.setFault('node', 'db', 'down'); }); }],
    ['workbench-impact', async () => { await page.evaluate(() => { const w = window.ArchiMadeEasy.workbench; w.setMode('chaos'); w.setFault('node', 'db', 'down'); w.setTab('impact'); }); }],
    ['workbench-review', async () => { await page.evaluate(() => window.ArchiMadeEasy.workbench.setTab('review')); }],
    ['workbench-traffic-10x', async () => { await page.evaluate(() => { const w = window.ArchiMadeEasy.workbench; w.setMode('traffic'); w.setTraffic(10, 0); }); }],
    ['workbench-security', async () => { await page.evaluate(() => window.ArchiMadeEasy.workbench.setMode('security')); }],
    ['workbench-finops', async () => { await page.evaluate(() => window.ArchiMadeEasy.workbench.setMode('finops')); }],
  ];
  for (const [name, act] of workbench) {
    for (const [width, height, theme] of [[1440, 900, 'light'], [1440, 900, 'dark']]) {
      await open('before-web-ha.html', theme, width, height);
      await act();
      await page.waitForTimeout(400);
      await shot(before, `web-ha-${width}x${height}-${theme}-${name}`);
    }
  }
  for (const [width, height] of [[768, 1024], [390, 844]]) {
    await open('before-web-ha.html', 'light', width, height);
    await page.evaluate(() => { const w = window.ArchiMadeEasy.workbench; w.setMode('chaos'); w.setFault('node', 'db', 'down'); w.setTab('impact'); });
    await page.waitForTimeout(400);
    await shot(before, `web-ha-${width}x${height}-light-workbench-impact`);
  }

  return { screenshots: log.length, errors, observations };
}
