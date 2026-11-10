// Walk through the three flagship examples with real pointer and keyboard input, through the
// Playwright MCP tool (browser_run_code, filename mode). This is the third layer of the
// browser QA matrix: a person-like pass over the finished pages, at the six viewports and
// in both themes, that records what it finds instead of asserting silently.
//
// Pages are served from a scratch directory on 127.0.0.1:8765 (see README.md in this
// folder). The tool's sandbox has no file-system module: screenshots are written by
// Playwright itself, and the findings are returned to the caller, who saves them.
async (page) => {
  const BASE = 'http://127.0.0.1:8765/';
  const OUT = '/ABSOLUTE/PATH/TO/archi-made-easy/docs/visual-qa/mcp-walkthrough';
  const VIEWPORTS = [[1920, 1080], [1440, 900], [1366, 768], [1280, 800], [768, 1024], [390, 844]];
  const PAGES = [
    { file: 'fintech', title: 'Global fintech payment mesh', scenario: 'b', node: 'pay_a' },
    { file: 'ai', title: 'Enterprise agentic AI platform', scenario: 'd', node: 'router' },
    { file: 'c4', title: 'Cloud-native e-commerce platform', scenario: 'b', node: 'checkout', level: 'checkout-service' },
  ];
  const problems = []; const visited = []; const shots = []; const errors = [];
  page.on('pageerror', (error) => errors.push(String(error.message)));
  page.on('console', (message) => { if (message.type() === 'error' && !/favicon/.test(message.text())) errors.push(message.text()); });
  await page.emulateMedia({ reducedMotion: 'reduce' });

  const settle = () => page.evaluate(async () => {
    const frame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    await document.fonts.ready; await frame();
    await ArchiMadeEasy.readerLayout.whenStable().catch(() => {});
    await ArchiMadeEasy.viewerChromeLayout.whenStable().catch(() => {});
    await frame();
  });
  const facts = () => page.evaluate(() => {
    const r = (e) => e.getBoundingClientRect();
    const html = document.documentElement; const w = ArchiMadeEasy.workbench;
    const c = document.querySelector('.diagram-container'); const svg = c.querySelector(':scope > svg');
    const nav = c.querySelector('.diagram-nav'); const legend = svg.querySelector('[data-legend]');
    const vitals = document.getElementById('workbench-vitals'); const inspector = document.getElementById('workbench-inspector');
    const overlap = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    const scale = r(svg).width / svg.viewBox.baseVal.width;
    const sizes = [...svg.querySelectorAll('g[data-node-id] text[data-node-label], g[data-node-id] text[data-detail="context"]')].map((t) => parseFloat(t.getAttribute('font-size')) * scale);
    const docked = html.getAttribute('data-ame-dock') === 'docked';
    return {
      theme: html.getAttribute('data-theme'), on: w.isOn(), open: w.isOpen(), mode: w.state().mode, dock: html.getAttribute('data-ame-dock'),
      overflowX: html.scrollWidth > innerWidth,
      canvasUnderBar: innerWidth >= 1024 && !vitals.hidden ? Math.max(0, Math.round(r(c).bottom - r(vitals).top)) : 0,
      toolsOnLegend: innerWidth >= 900 && getComputedStyle(nav).display !== 'none' ? Math.round(overlap(r(nav), r(legend))) : 0,
      inspectorOnCanvas: docked && !inspector.hidden ? Math.round(overlap(r(inspector), r(c))) : 0,
      smallestLabelPx: Math.round(Math.min(...sizes) * 10) / 10, readouts: document.querySelectorAll('#workbench-vitals [data-readout]').length,
      background: getComputedStyle(document.body).backgroundColor,
    };
  });
  const check = (where, state, f, extra = []) => {
    visited.push(`${where} ${state}`);
    const found = [...extra];
    if (f.overflowX) found.push('the page scrolls sideways');
    if (f.canvasUnderBar > 1) found.push(`the canvas runs ${f.canvasUnderBar}px under the vitals bar`);
    if (f.toolsOnLegend > 2 && !(f.open && f.dock !== 'docked')) found.push('the canvas tools sit on the legend');
    if (f.inspectorOnCanvas > 2) found.push('the docked inspector covers the canvas');
    if (f.readouts !== 6) found.push(`the vitals bar shows ${f.readouts} figures, not 6`);
    for (const message of found) problems.push(`${where} ${state}: ${message}`);
  };
  // A real click on a component when it is on screen and not under a panel; the model otherwise.
  const selectComponent = async (id) => {
    const point = await page.evaluate((nodeId) => {
      const box = document.querySelector(`[data-node-id="${nodeId}"] rect:not(.c-mask)`).getBoundingClientRect();
      const x = box.left + box.width / 2; const y = box.top + box.height / 2;
      const hit = x > 0 && y > 0 && x < innerWidth && y < innerHeight ? document.elementFromPoint(x, y) : null;
      return hit && hit.closest(`[data-node-id="${nodeId}"]`) ? { x, y } : null;
    }, id);
    if (point) await page.mouse.click(point.x, point.y); else await page.evaluate((nodeId) => ArchiMadeEasy.workbench.select(nodeId), id);
    return Boolean(point);
  };

  for (const entry of PAGES) {
    for (const [width, height] of VIEWPORTS) {
      for (const theme of ['light', 'dark']) {
        const where = `${entry.file} ${width}x${height} ${theme}`;
        await page.setViewportSize({ width, height });
        await page.goto(`${BASE}${entry.file}.html?theme=${theme}`, { waitUntil: 'load' });
        await settle();
        const shot = async (state) => { const file = `${OUT}/${entry.file}-${width}x${height}-${theme}-${state}.png`; await page.screenshot({ path: file, scale: 'css', type: 'png' }); shots.push(file.split('/').pop()); };
        const wanted = (width === 1440 && theme === 'light') || (width === 390 && theme === 'dark');

        // A. First view.
        let f = await facts();
        check(where, 'initial', f, [
          ...(f.on && !f.open ? [] : ['a flagship should start with the frame on and the inspector closed']),
          ...(f.theme === theme ? [] : [`theme is ${f.theme}`]),
          ...((await page.title()).includes(entry.title) ? [] : ['unexpected page title']),
          ...(width >= 1024 && f.smallestLabelPx < 6 ? [`smallest label ${f.smallestLabelPx}px`] : []),
        ]);

        // D. Inspect a component: Explore, then the component.
        await page.click('[data-workbench-mode="explore"]');
        const byPointer = await selectComponent(entry.node);
        await settle();
        const explored = await page.evaluate((nodeId) => { const w = ArchiMadeEasy.workbench; const label = w.model().nodes.find((n) => n.id === nodeId).label; return { selected: w.state().selected, shown: document.getElementById('workbench-body').textContent.includes(label) }; }, entry.node);
        check(where, `explore (${byPointer ? 'pointer' : 'model'})`, await facts(), explored.selected === entry.node && explored.shown ? [] : ['the inspector does not show the selected component']);

        // J. Review: open the first finding when there is one.
        await page.click('[data-workbench-mode="review"]');
        const finding = await page.$('#workbench-body [data-workbench-finding]');
        if (finding) await finding.click();
        await settle();
        const reviewed = await page.evaluate(() => { const w = ArchiMadeEasy.workbench; const body = document.getElementById('workbench-body').textContent; return { findings: w.review().findings.length, detail: Boolean(document.querySelector('[data-workbench-finding-detail]')), lit: document.querySelectorAll('.diagram-container g[data-wb-lit]').length, clean: /No rule fired/.test(body) }; });
        check(where, 'review', await facts(), reviewed.findings ? (reviewed.detail && reviewed.lit ? [] : ['the selected finding is not explained or not shown on the diagram']) : (reviewed.clean ? [] : ['a review without findings does not say what that means']));
        if (wanted && entry.file === 'ai') await shot('review');

        // F. Simulate: choose the scenario, run it.
        await page.click('[data-workbench-mode="simulate"]');
        await page.click(`#workbench-body [data-workbench-scenario="${entry.scenario}"]`);
        const before = await page.evaluate(() => document.querySelectorAll('.diagram-container [data-wb-state]').length);
        await page.click('#workbench-body [data-workbench-run]');
        await settle();
        const ran = await page.evaluate(() => { const w = ArchiMadeEasy.workbench; const result = w.result(); const notOk = Object.keys(result.nodes).filter((id) => result.nodes[id].state !== 'ok').length; return { ran: w.state().sim.ran, notOk, marked: document.querySelectorAll('.diagram-container g[data-wb-state]').length, impact: Boolean(document.querySelector('[data-workbench-impact]')), condition: Boolean(document.querySelector('#workbench-vitals [data-workbench-condition]')) }; });
        check(where, 'simulate', await facts(), [
          ...(before === 0 ? [] : ['components are marked before the scenario is run']),
          ...(ran.ran && ran.notOk > 0 && ran.marked > 0 && ran.impact ? [] : ['the run shows no impact']),
          ...(ran.condition ? [] : ['the vitals bar does not name the condition']),
        ]);
        if (wanted && entry.file !== 'ai') await shot('simulate');
        await page.click('#workbench-body [data-workbench-reset]');

        // L. Levels: open a child diagram, look, come back with the keyboard.
        if (entry.level) {
          await page.click('[data-workbench-mode="explore"]');
          await page.evaluate(() => { const w = ArchiMadeEasy.workbench; w.select(null); });
          await page.click(`#workbench-body [data-workbench-level="${entry.level}"]`);
          await page.waitForFunction(() => { const level = ArchiMadeEasy.workbench.level(); return level && level.ready; }, null, { timeout: 15000 });
          await page.waitForTimeout(900);
          const level = await page.evaluate(() => { const frame = document.querySelector('.ame-level-frame').getBoundingClientRect(); const bar = document.querySelector('.ame-level-bar').getBoundingClientRect(); return { report: ArchiMadeEasy.workbench.level().report, fills: Math.abs(frame.top - bar.bottom) <= 1 && Math.abs(frame.bottom - innerHeight) <= 1 && Math.abs(frame.width - innerWidth) <= 1, focusOnBack: document.activeElement.hasAttribute('data-workbench-level-back'), overflowX: document.documentElement.scrollWidth > innerWidth }; });
          visited.push(`${where} level`);
          if (!(level.report.workbench && level.report.nodes === 9 && level.report.theme === theme)) problems.push(`${where} level: the child page did not start as expected (${JSON.stringify(level.report)})`);
          if (!level.fills || level.overflowX) problems.push(`${where} level: the child page does not fill the window under the bar`);
          if (!level.focusOnBack) problems.push(`${where} level: focus is not on Back`);
          if (wanted) await shot('level');
          await page.keyboard.press('Escape');
          const closed = await page.evaluate(() => !document.getElementById('workbench-level') && !ArchiMadeEasy.workbench.level() && ![...document.body.children].some((element) => element.inert));
          if (!closed) problems.push(`${where} level: something of the level view remains after Escape`);
        }
        if (errors.length) { for (const message of errors.splice(0)) problems.push(`${where}: console or page error: ${message.slice(0, 160)}`); }
      }
    }
  }
  return { pages: PAGES.length, viewports: VIEWPORTS.length, themes: 2, statesVisited: visited.length, problems, screenshots: shots };
}
