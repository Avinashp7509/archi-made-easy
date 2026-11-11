// Guided demo layer over a rendered Archi-Made-Easy page (built by scripts/build-demo.mjs).
// One journey: read the architecture, fail the database, see what fails, compare a standby.
// The diagram states are drawn by the page's own workbench; every figure shown here comes
// from the same engine (ArchiMadeEasy.workbenchEngine) the workbench and the CLI use.
// Shareable states: #database-fails and #with-standby. ?full shows the whole workbench.
(function () {
  'use strict';
  var root = document.documentElement;
  var params = new URLSearchParams(window.location.search);
  if (params.has('full')) { root.removeAttribute('data-demo'); return; }
  var A = window.ArchiMadeEasy || {};
  var w = A.workbench; var E = A.workbenchEngine;
  var slot = document.getElementById('archi-made-easy-workbench-data');
  if (!w || !w.available || !E || !slot) { root.removeAttribute('data-demo'); return; }

  var DB = 'orders_db';
  var STANDBY = 'standby:' + DB;
  var FAULT = { faults: { nodes: {} } }; FAULT.faults.nodes[DB] = 'down';
  var REPO = 'https://github.com/Avinashp7509/archi-made-easy';
  var INSTALL = 'npx skills add Avinashp7509/archi-made-easy';
  var PROMPT = 'Draw our checkout architecture and show what happens if the orders database fails.';

  // ---- the model: computed once, the same way the workbench computes it ----------------
  var doc = JSON.parse(slot.textContent).document;
  var model = E.buildModel(doc).model;
  var byId = {}; model.nodes.forEach(function (n) { byId[n.id] = n; });
  var plan = E.recoveryPlan(doc, FAULT);
  var option = plan.options.filter(function (o) { return o.id === STANDBY; })[0];
  if (!option) { root.removeAttribute('data-demo'); return; }
  var withModel = E.buildModel(E.applyPatches(doc, option.patches)).model;
  var R = {
    healthy: E.simulate(model, {}), failure: E.simulate(model, FAULT),
    standbyHealthy: E.simulate(withModel, {}), standbyFailure: E.simulate(withModel, FAULT),
  };
  var parts = model.nodes.filter(function (n) { return !n.actor; });
  function inState(result, state) { return parts.filter(function (n) { return result.nodes[n.id].state === state; }); }
  function lostPct(result) { var s = result.kpis.blast_radius.ingress_share; return s == null ? 0 : Math.round(s * 100); }
  function pct(value) { return (Math.round(value * 1000) / 1000).toFixed(3) + '%'; }
  function downtime(availability) {
    var hours = (100 - availability) / 100 * 8760;
    return hours >= 1 ? 'about ' + (Math.round(hours * 10) / 10) + ' hours a year' : 'about ' + Math.round(hours * 60) + ' minutes a year';
  }
  var dbLabel = byId[DB].label;
  var failing = inState(R.failure, 'failing');
  var working = inState(R.failure, 'ok');
  var spofBefore = R.healthy.kpis.active_spofs.length; var spofAfter = R.standbyHealthy.kpis.active_spofs.length;

  // ---- small DOM helpers (no HTML strings) ---------------------------------------------
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (key) {
      if (key === 'text') node.textContent = attrs[key];
      else if (key === 'className') node.className = attrs[key];
      else if (key.slice(0, 2) === 'on') node.addEventListener(key.slice(2), attrs[key]);
      else node.setAttribute(key, attrs[key]);
    });
    (children || []).forEach(function (child) { if (child != null) node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child); });
    return node;
  }
  function tag(text, kind) { return el('span', { className: 'demo-tag' + (kind ? ' demo-tag--' + kind : ''), text: text }); }
  function stateList(nodes, badge, kind, note) {
    return el('ul', { className: 'demo-state' }, nodes.map(function (n) {
      var text = typeof badge === 'function' ? badge(n) : badge;
      return el('li', {}, [el('span', { className: 'demo-badge demo-badge--' + kind, text: text }), el('span', {}, [el('strong', { text: n.label }), note ? ' ' + note(n) : ''])]);
    }));
  }
  function copyButton(text, label) {
    var status = el('span', { className: 'demo-status', role: 'status' });
    var button = el('button', { type: 'button', className: 'demo-copy', text: 'Copy', 'aria-label': 'Copy ' + label, onclick: function () { copy(text, status); } });
    return [el('div', { className: 'demo-code' }, [el('code', { text: text }), button]), status];
  }
  function copy(text, status) {
    var done = function () { status.textContent = 'Copied.'; setTimeout(function () { status.textContent = ''; }, 2500); };
    var fallback = function () {
      var area = el('textarea', { 'aria-hidden': 'true', style: 'position:fixed;opacity:0;left:-9999px' }); area.value = text;
      document.body.appendChild(area); area.select();
      try { document.execCommand('copy'); done(); } catch (error) { status.textContent = 'Copy this: ' + text; }
      area.remove();
    };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, fallback); else fallback();
  }

  // ---- the panels ------------------------------------------------------------------------
  var container = document.querySelector('.container');
  var header = container.querySelector('.header');
  var side = el('div', { className: 'demo-side' });

  var leadStatus = el('p', { className: 'demo-status', role: 'status', 'aria-live': 'polite' });
  var failButton = el('button', { type: 'button', className: 'demo-btn demo-btn--wide', 'data-demo-action': 'fail', text: 'What happens if the database fails?', onclick: function () { go('failure', { animate: true, focus: true }); } });
  var lead = el('section', { className: 'demo-card demo-lead', 'aria-labelledby': 'demo-title' }, [
    el('p', { className: 'demo-eyebrow', text: 'Interactive demo · runs in your browser' }),
    el('h2', { id: 'demo-title', text: 'What happens to checkout if the database fails?' }),
    el('p', { text: 'A shopper places an order. The API gateway passes it to the checkout service, which saves the order in the ' + dbLabel.toLowerCase() + ', charges the card, and puts the order on a queue for fulfilment.' }),
    el('p', { className: 'demo-muted', text: 'Select any component in the diagram to see what it connects to. Nothing you do here is sent anywhere.' }),
    failButton, leadStatus,
  ]);

  // Step 1: the failure
  var failHeading = el('h3', { tabindex: '-1', text: 'The database is down: every checkout fails' });
  var failure = el('section', { className: 'demo-card demo-reveal', 'data-demo-step': 'failure', 'aria-labelledby': 'demo-fail-h', hidden: '' }, [
    el('p', { className: 'demo-label' }, ['Step 1 · the failure ', tag('modelled')]),
    failHeading,
    el('p', { text: 'The checkout service has to save each order before it can do anything else, so when the ' + dbLabel.toLowerCase() + ' stops answering, the checkout service fails too, and the API gateway returns those errors to shoppers. Nobody can place an order until the database is back.' }),
    el('div', { className: 'demo-figures' }, [
      el('div', { className: 'demo-figure demo-figure--bad' }, [el('b', { text: lostPct(R.failure) + '%' }), el('span', { text: 'of checkout requests fail' })]),
      el('div', { className: 'demo-figure demo-figure--bad' }, [el('b', { text: failing.length + ' of ' + parts.length }), el('span', { text: 'components fail' })]),
    ]),
    el('h4', { text: 'Fails' }),
    // The same words as the badges on the diagram: DOWN for the failure itself, FAILING for what it takes with it.
    stateList(failing, function (n) { return n.id === DB ? 'DOWN' : 'FAILING'; }, 'down', function (n) { return n.id === DB ? '(the failure)' : '(waits on the database)'; }),
    el('h4', { text: 'Keeps running' }),
    stateList(working, 'OK', 'ok', function (n) { return n.id === 'fulfilment' ? '(orders already on the queue still ship)' : ''; }),
    el('p', { className: 'demo-muted', text: 'The diagram shows the same result: failing components are marked and outlined, in the order the failure reaches them.' }),
    el('button', { type: 'button', className: 'demo-btn demo-btn--wide', 'data-demo-action': 'standby', text: 'Compare: add a standby database', onclick: function () { go('standby', { focus: true }); } }),
  ]);
  failure.id = 'demo-step-failure'; failHeading.id = 'demo-fail-h';

  // Step 2: the same failure with a standby
  var standbyHeading = el('h3', { id: 'demo-standby-h', tabindex: '-1', text: 'Same failure, with a standby database' });
  var viewSwitch = el('div', { className: 'demo-seg', role: 'group', 'aria-label': 'The diagram shows' }, [
    el('button', { type: 'button', 'data-view': 'scenario', 'aria-pressed': 'false', text: 'Without standby', onclick: function () { setView('scenario'); } }),
    el('button', { type: 'button', 'data-view': 'option', 'aria-pressed': 'true', text: 'With standby', onclick: function () { setView('option'); } }),
  ]);
  function row(label, note, before, after) {
    return el('tr', {}, [el('th', { scope: 'row' }, [label, note ? el('small', { text: note }) : null]), el('td', {}, before), el('td', { className: 'demo-better' }, after)]);
  }
  var hb = R.healthy.kpis.composite_sla_percent; var ha = R.standbyHealthy.kpis.composite_sla_percent;
  var standby = el('section', { className: 'demo-card demo-reveal', 'data-demo-step': 'standby', 'aria-labelledby': 'demo-standby-h', hidden: '' }, [
    el('p', { className: 'demo-label' }, ['Step 2 · one improvement ', tag('modelled')]),
    standbyHeading,
    el('p', { text: 'A standby is a second copy of the ' + dbLabel.toLowerCase() + ' in another failure domain, kept up to date. When the first copy fails, the standby takes over and checkout works again.' }),
    el('p', { className: 'demo-muted' }, ['Diagram: ', viewSwitch]),
    el('div', { className: 'demo-table-wrap' }, [el('table', { className: 'demo-table' }, [
      el('caption', { className: 'demo-muted', style: 'text-align:left;caption-side:bottom;padding-top:8px', text: 'Modelled from the design as drawn and from assumed availability figures for each kind of component. Not a measurement or a provider commitment.' }),
      el('thead', {}, [el('tr', {}, [el('th', { scope: 'col', text: 'Figure' }), el('th', { scope: 'col', text: 'Without' }), el('th', { scope: 'col', text: 'With standby' })])]),
      el('tbody', {}, [
        row('Checkout requests that fail', 'during this failure, once the standby has taken over', [lostPct(R.failure) + '%'], [lostPct(R.standbyFailure) + '%']),
        row('Components that fail', 'during this failure', [String(failing.length)], [String(inState(R.standbyFailure, 'failing').length)]),
        row('Single points of failure', 'on a normal day', [String(spofBefore)], [String(spofAfter)]),
        row('Checkout available', 'on a normal day', [pct(hb), el('small', { text: downtime(hb) + ' down' })], [pct(ha), el('small', { text: downtime(ha) + ' down' })]),
      ]),
    ])]),
    el('h4', { text: 'What it costs you' }),
    el('ol', { className: 'demo-trade' }, [
      el('li', {}, [el('strong', { text: 'Not instant. ' }), 'Checkout still fails until the standby has taken over: the recovery time (RTO). This example states no recovery time, so the model shows the state after the takeover, not how long it takes.']),
      el('li', {}, [el('strong', { text: 'The last orders can be lost. ' }), 'If the copy is kept up to date asynchronously, orders saved in the moments before the failure may be missing on the standby: the recovery point (RPO). Synchronous copying prevents that, but every order save then waits for the second copy.']),
      el('li', {}, [el('strong', { text: 'A second database to pay for and run. ' }), 'It mostly waits. No prices are stated in this example, so the model does not estimate the cost.']),
      el('li', {}, [el('strong', { text: 'Takeover has to be tested. ' }), 'The model assumes it succeeds 95 times in 100. A takeover that has never been rehearsed is the one most likely to fail.']),
    ]),
    el('p', { className: 'demo-note demo-muted' }, [el('strong', { text: 'Why not circuit breakers instead? ' }), 'They make the gateway and checkout service fail fast instead of waiting, so the failure stops spreading. But every checkout still fails to save its order: breakers limit the damage, they do not bring checkout back.']),
    el('div', { className: 'demo-row' }, [
      el('button', { type: 'button', className: 'demo-ghost', 'data-demo-action': 'reset', text: 'Start again', onclick: function () { go('intro', { focus: true }); } }),
      el('button', { type: 'button', className: 'demo-ghost', 'data-demo-action': 'share', text: 'Copy link to this result', onclick: function () { copy(window.location.href, shareStatus); } }),
    ]),
  ]);
  var shareStatus = el('p', { className: 'demo-status', role: 'status' });
  standby.appendChild(shareStatus);

  // Step 3: make one for your own system
  var cta = el('section', { className: 'demo-card', 'aria-labelledby': 'demo-cta-h' }, [
    el('p', { className: 'demo-label', text: 'Your system' }),
    el('h3', { id: 'demo-cta-h', text: 'Create this for your system' }),
    el('p', { text: 'Archi-Made-Easy is a free, open-source skill for AI coding agents. Describe your system in plain words; your agent draws it and gives you a page like this one.' }),
    el('p', { className: 'demo-label', text: '1 · Install (Node.js 22.20 or newer)' }),
  ].concat(copyButton(INSTALL, 'the install command')).concat([
    el('p', { className: 'demo-label', text: '2 · Ask your agent' }),
  ]).concat(copyButton(PROMPT, 'the example request')).concat([
    el('p', { className: 'demo-muted' }, ['Tested with Claude Code; it also installs for Codex, Copilot, Cursor and others. ', el('a', { className: 'demo-link', href: REPO + '#quick-start', text: 'Quick start and supported agents' })]),
  ]));

  var foot = el('section', { className: 'demo-card demo-foot', 'aria-label': 'About this demo' }, [
    el('p', {}, [tag('modelled'), ' ', tag('assumed', 'assumed'), ' Every figure here comes from an analytical model of the design as drawn, using planning defaults where the design states nothing. It shows how a failure spreads and what a change would do. It is not a load test, a measurement or a vendor SLA.']),
    el('p', {}, [el('a', { href: '?full', text: 'Open the full workbench' }), ' · ', el('a', { href: REPO, text: 'Source on GitHub' }), ' · Apache-2.0 · ', el('a', { href: REPO + '/blob/main/NOTICE', text: 'Notices' })]),
  ]);

  side.appendChild(lead); side.appendChild(failure); side.appendChild(standby); side.appendChild(cta); side.appendChild(foot);
  container.insertBefore(side, header.nextSibling);
  // On phones the steps follow the diagram: .demo-side uses display: contents there, and the
  // CSS orders the lead before the diagram and the steps after it.
  [failure, standby, cta, foot].forEach(function (section) { section.classList.add('demo-steps'); });

  // ---- driving the workbench ----------------------------------------------------------------
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var wide = window.matchMedia ? window.matchMedia('(min-width: 960px)') : { matches: true };
  var step = 'intro';

  function setView(view) {
    var button = document.querySelector('#workbench-inspector [data-workbench-view="' + view + '"]');
    if (button) button.click();
    viewSwitch.querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-view') === view)); });
  }
  function runFailure(animate) {
    w.reset();
    w.setFault('node', DB, 'down');
    w.run({ instant: !animate || reduced });
  }
  function reveal(section, focusTarget, options) {
    section.hidden = false;
    if (!options.focus) return;
    focusTarget.focus({ preventScroll: true });
    if (wide.matches) section.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
    else document.querySelector('.diagram-container').scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' });
  }
  function go(next, options) {
    options = options || {};
    step = next;
    if (next === 'intro') {
      w.reset(); w.off();
      failure.hidden = true; standby.hidden = true; leadStatus.textContent = '';
      failButton.textContent = 'What happens if the database fails?';
      if (options.focus) failButton.focus();
    } else {
      runFailure(options.animate && next === 'failure');
      failButton.textContent = 'Run the failure again';
      leadStatus.textContent = failing.length + ' of ' + parts.length + ' components fail and ' + lostPct(R.failure) + '% of checkouts fail.' + (wide.matches ? '' : ' Details below the diagram.');
      reveal(failure, failHeading, next === 'failure' ? options : {});
      if (next === 'standby') {
        w.chooseOption(STANDBY);
        setView('option');
        reveal(standby, standbyHeading, options);
      } else {
        standby.hidden = true;
      }
    }
    var hash = next === 'failure' ? '#database-fails' : next === 'standby' ? '#with-standby' : '';
    if (window.location.hash !== hash) history.replaceState(null, '', hash || window.location.pathname + window.location.search);
  }
  function fromHash() {
    var hash = window.location.hash;
    go(hash === '#with-standby' ? 'standby' : hash === '#database-fails' ? 'failure' : 'intro', {});
  }
  window.addEventListener('hashchange', fromHash);
  fromHash();
  root.setAttribute('data-demo-ready', 'true');
}());
