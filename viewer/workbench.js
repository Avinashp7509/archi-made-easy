    /* ============================================================
       Architecture Workbench.
       Present only on pages that carry workbench data (architecture
       diagrams). It adds three regions around the canvas: a mode rail
       on the left, a vitals strip above, and an inspector on the right.
       Each mode answers one question about the declared design.

       Every figure comes from ArchiMadeEasy.workbenchEngine, the same
       analytical model the command line runs. Nothing here is measured;
       the interface says so wherever a figure is shown.

       Fault states, badges and spotlights are exploration state: export
       cleanup removes them. Design: docs/visual-qa/DESIGN-SYSTEM.md.
       ============================================================ */
    ArchiMadeEasy.workbench = (function () {
      'use strict';
      var inert = { available: false, isOn: function () { return false; }, isOpen: function () { return false; } };
      var dataElement = document.getElementById('archi-made-easy-workbench-data');
      var engine = ArchiMadeEasy.workbenchEngine;
      var container = document.querySelector('.diagram-container');
      var svg = container && container.querySelector('svg');
      if (!dataElement || !engine || !svg) return inert;

      var doc; var model; var scenarios; var baseline; var baselineFigures;
      try {
        doc = JSON.parse(dataElement.textContent).document;
        model = engine.buildModel(doc).model;
        scenarios = engine.buildScenarios(model);
        baseline = engine.simulate(model, {});
        baselineFigures = engine.figures(model, {});
      } catch (error) {
        // The diagram stays fully usable without the workbench; the reason is kept for diagnosis.
        inert.error = String(error && error.message || error);
        return inert;
      }

      var html = document.documentElement;
      var SVG_NS = 'http://www.w3.org/2000/svg';
      var MODES = [
        ['explore', 'Explore', 'What each component is and what it depends on.'],
        ['review', 'Review', 'What is wrong with this design, and why it matters.'],
        ['simulate', 'Simulate', 'What happens when something fails.'],
        ['security', 'Security', 'What is exposed, and what protects it.'],
        ['performance', 'Performance', 'Where it saturates and how slow it gets.'],
        ['finops', 'FinOps', 'What it costs each month.'],
        ['optimize', 'Optimize', 'What to change first.'],
        ['decide', 'Decide', 'Why it is built this way, and the options.'],
        ['handoff', 'Handoff', 'Take the architecture to other tools.'],
      ];
      var MODE_ALIASES = { chaos: 'simulate', traffic: 'performance' };
      var CYCLE = ['healthy', 'degraded', 'down', 'partitioned'];
      var nodeById = {}; var edgeIndex = {}; var boundaryIndex = {};
      model.nodes.forEach(function (node) { nodeById[node.id] = node; });
      model.edges.forEach(function (edge, index) { edgeIndex[edge.id] = index; });
      model.boundaries.forEach(function (boundary, index) { boundaryIndex[boundary.id] = index; });

      var emptyFaults = function () { return { nodes: {}, edges: {}, boundaries: {} }; };
      var state = {
        on: false, inspector: false, mode: 'explore', selected: null,
        // Simulate: a scenario is set up, then run. Nothing is shown as failing before Run.
        sim: { scenario: '', faults: emptyFaults(), multiplier: 1, cacheHit: 0, arm: false, ran: false, wave: 0, option: null, view: 'scenario' },
        // Performance: load and cache are live.
        perf: { multiplier: 1, cacheHit: 0 },
        finding: null, change: null, trace: { id: null, step: 0 },
      };
      var current = { result: baseline, review: null, cost: null, figures: baselineFigures, plan: null, waves: null, optionResult: null, changes: null, alternatives: null, fmea: null };
      var playTimer = 0;

      // ---- helpers -------------------------------------------------------------------
      function el(tag, attributes, children) {
        var node = document.createElement(tag);
        Object.keys(attributes || {}).forEach(function (key) {
          var value = attributes[key];
          if (value == null || value === false) return;
          if (key === 'text') node.textContent = value;
          else if (key === 'className') node.className = value;
          else if (key === 'onclick') node.addEventListener('click', value);
          else node.setAttribute(key, value === true ? '' : value);
        });
        (children || []).forEach(function (child) { if (child) node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child); });
        return node;
      }
      function svgEl(tag, attributes) {
        var node = document.createElementNS(SVG_NS, tag);
        Object.keys(attributes).forEach(function (key) { node.setAttribute(key, attributes[key]); });
        return node;
      }
      function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
      function label(id) { return nodeById[id] ? nodeById[id].label : id; }
      function number(value, digits) {
        if (value == null) return 'n/a';
        var factor = Math.pow(10, digits == null ? 0 : digits);
        return String(Math.round(value * factor) / factor).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      }
      /** A share as text. A value below 100 is floored, so it can never be shown as 100%. */
      function percent(value) {
        if (value == null) return 'n/a';
        return (value >= 100 ? '100' : number(Math.floor(value * 1000) / 1000, 3)) + '%';
      }
      function plural(count, word) { return count + ' ' + word + (count === 1 ? '' : 's'); }
      function icon(name) { return el('span', { className: 'ame-icon ame-icon--' + name, 'aria-hidden': 'true' }); }
      function tag(kind, text) { return el('span', { className: 'ame-tag ame-tag--' + kind, text: text || kind }); }
      function basisTag(basis) { return basis === 'assumed' ? tag('assumed', 'assumed') : tag('authored', 'authored'); }
      function section(title, children) { return el('section', { className: 'ame-section' }, [el('h3', { className: 'ame-eyebrow', text: title })].concat(children)); }
      function button(text, onclick, extra) { return el('button', Object.assign({ type: 'button', className: 'ame-btn', text: text, onclick: onclick }, extra || {})); }
      function selector(attribute, value) { return '[' + attribute + '="' + String(value).replace(/["\\]/g, '\\$&') + '"]'; }
      function nodeElement(id) { return svg.querySelector(selector('data-node-id', id)); }
      function edgeElements(id) {
        var edge = model.edges[edgeIndex[id]];
        var query = edge && edge.idAuthored ? selector('data-edge-id', id) : selector('data-edge-key', edgeIndex[id]);
        return Array.prototype.slice.call(svg.querySelectorAll('path' + query));
      }
      function frameElements(id) { return Array.prototype.slice.call(svg.querySelectorAll(selector('data-composition-frame-id', boundaryIndex[id]))); }
      function copyFaults(faults) { return { nodes: Object.assign({}, faults.nodes), edges: Object.assign({}, faults.edges), boundaries: Object.assign({}, faults.boundaries) }; }
      function faultCount(faults) { return Object.keys(faults.nodes).length + Object.keys(faults.edges).length + Object.keys(faults.boundaries).length; }
      function reducedMotion() { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (error) { return false; } }
      function simInputs() { return { multiplier: state.sim.multiplier, cacheHit: state.sim.cacheHit, faults: copyFaults(state.sim.faults) }; }
      function simIsSet() { return faultCount(state.sim.faults) > 0 || state.sim.multiplier !== 1 || state.sim.cacheHit !== 0; }
      /** The conditions the figures on screen are computed under. */
      function activeInputs() {
        if (state.on && state.mode === 'simulate' && state.sim.ran) return simInputs();
        if (state.on && state.mode === 'performance') return { multiplier: state.perf.multiplier, cacheHit: state.perf.cacheHit, faults: emptyFaults() };
        return { multiplier: 1, cacheHit: 0, faults: emptyFaults() };
      }
      function isBaseline(inputs) { return inputs.multiplier === 1 && inputs.cacheHit === 0 && faultCount(inputs.faults) === 0; }
      /** The condition in words: what the reader did to get these figures. */
      function conditionText(inputs) {
        var parts = [];
        var scenario = scenarios.filter(function (s) { return s.id === state.sim.scenario; })[0];
        if (state.mode === 'simulate' && scenario) parts.push(scenario.title);
        else {
          Object.keys(inputs.faults.nodes).forEach(function (id) { parts.push(label(id) + ' ' + inputs.faults.nodes[id]); });
          Object.keys(inputs.faults.edges).forEach(function (id) { parts.push(id + ' ' + inputs.faults.edges[id]); });
          Object.keys(inputs.faults.boundaries).forEach(function (id) { var b = model.boundaries[boundaryIndex[id]]; parts.push((b ? b.label : id) + ' ' + inputs.faults.boundaries[id]); });
          if (inputs.multiplier !== 1) parts.push(inputs.multiplier + 'x load');
          if (inputs.cacheHit !== 0) parts.push(Math.round(inputs.cacheHit * 100) + '% cache hits');
        }
        return parts.join(', ');
      }

      // ---- regions -------------------------------------------------------------------
      var rail = el('nav', { className: 'ame-rail no-print', id: 'workbench-rail', 'aria-label': 'Architecture workbench' });
      var railButtons = {};
      MODES.forEach(function (entry, index) {
        if (index === 7) rail.appendChild(el('span', { className: 'ame-rail-sep', 'aria-hidden': 'true' }));
        var b = el('button', { type: 'button', className: 'ame-rail-btn', 'data-workbench-mode': entry[0], 'aria-pressed': 'false', title: entry[2], 'aria-controls': 'workbench-inspector' },
          [icon(entry[0]), el('span', { className: 'ame-rail-label', text: entry[1] })]);
        b.addEventListener('click', function () { if (state.on && state.inspector && state.mode === entry[0]) setInspector(false); else setMode(entry[0]); });
        railButtons[entry[0]] = b;
        rail.appendChild(b);
      });
      var vitals = el('section', { className: 'ame-vitals no-print', id: 'workbench-vitals', 'aria-label': 'Modelled figures for this architecture', hidden: true });
      var basisBlock = el('div', { className: 'ame-basis' });
      var readouts = el('div', { className: 'ame-readouts', role: 'group', 'aria-label': 'Key figures' });
      vitals.appendChild(basisBlock); vitals.appendChild(readouts);
      var toggle = document.getElementById('btn-workbench');
      if (toggle) {
        toggle.hidden = false;
        toggle.setAttribute('aria-controls', 'workbench-rail');
        toggle.addEventListener('click', function () { if (state.on) setOn(false); else setOn(true); });
      }
      var inspector = el('aside', { className: 'ame-inspector no-print', id: 'workbench-inspector', 'aria-labelledby': 'workbench-inspector-title', hidden: true });
      var inspectorTitle = el('h2', { id: 'workbench-inspector-title' });
      var inspectorClose = el('button', { type: 'button', className: 'ame-btn ame-btn--quiet ame-icon-btn', 'aria-label': 'Collapse the inspector', title: 'Collapse the inspector' }, [icon('collapse')]);
      inspectorClose.addEventListener('click', function () { setInspector(false); railButtons[state.mode].focus(); });
      var body = el('div', { className: 'ame-inspector-body', id: 'workbench-body', tabindex: '0', role: 'region', 'aria-label': 'Inspector content' });
      var announcer = el('p', { className: 'ame-muted', role: 'status', 'aria-live': 'polite', style: 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap' });
      inspector.appendChild(el('div', { className: 'ame-inspector-head' }, [inspectorTitle, tag('modelled', 'modelled'), inspectorClose]));
      inspector.appendChild(body);
      inspector.appendChild(announcer);
      document.body.appendChild(rail);
      document.body.appendChild(vitals);
      document.body.appendChild(inspector);
      html.setAttribute('data-ame-rail', 'true');
      inspector.addEventListener('keydown', function (event) {
        if (event.key !== 'Escape') return;
        event.stopPropagation();
        setInspector(false);
        railButtons[state.mode].focus();
      });

      // ---- model runs ----------------------------------------------------------------
      function run() {
        var inputs = activeInputs();
        current.result = isBaseline(inputs) ? baseline : engine.simulate(model, inputs);
        current.figures = isBaseline(inputs) ? baselineFigures : engine.figures(model, inputs);
        if (!current.review) current.review = engine.review(model, {});
        current.cost = engine.estimateCost(model, current.result);
      }
      /** Order in which a failure reaches components: the origin first, then each ring of callers. */
      function wavesFor(result) {
        var wave = {}; var assigned = 0; var affected = result.kpis.blast_radius.nodes;
        affected.forEach(function (id) { if (result.nodes[id].fault) { wave[id] = 0; assigned += 1; } });
        var level = 0;
        while (assigned < affected.length && level < affected.length) {
          var next = [];
          model.edges.forEach(function (edge) {
            if (wave[edge.to] != null && wave[edge.to] <= level && wave[edge.from] == null && affected.indexOf(edge.from) !== -1 && next.indexOf(edge.from) === -1) next.push(edge.from);
          });
          level += 1;
          if (!next.length) { affected.forEach(function (id) { if (wave[id] == null) { wave[id] = level; assigned += 1; } }); break; }
          next.forEach(function (id) { wave[id] = level; assigned += 1; });
        }
        var last = 0; Object.keys(wave).forEach(function (id) { last = Math.max(last, wave[id]); });
        return { of: wave, last: last };
      }

      // ---- canvas overlays -----------------------------------------------------------
      function clearOverlays() {
        Array.prototype.forEach.call(svg.querySelectorAll('[data-workbench-overlay]'), function (node) { node.remove(); });
        Array.prototype.forEach.call(svg.querySelectorAll('[data-wb-state], [data-wb-edge], [data-wb-fault], [data-wb-lit], [data-wb-pending]'), function (node) {
          ['data-wb-state', 'data-wb-edge', 'data-wb-fault', 'data-wb-lit', 'data-wb-pending'].forEach(function (name) { node.removeAttribute(name); });
        });
        ['data-wb-mode', 'data-wb-arm', 'data-wb-spotlight'].forEach(function (name) { svg.removeAttribute(name); });
      }
      function badge(layer, element, text, tone) {
        var box;
        try { box = element.getBBox(); } catch (error) { return; }
        var width = text.length * 6.1 + 12;
        var group = svgEl('g', { 'class': 'workbench-badge workbench-badge--' + tone, transform: 'translate(' + (box.x + box.width - width + 6) + ' ' + (box.y - 9) + ')' });
        group.appendChild(svgEl('rect', { width: width, height: 16, rx: 3 }));
        var text_ = svgEl('text', { x: width / 2, y: 11.5, 'text-anchor': 'middle' });
        text_.textContent = text;
        group.appendChild(text_);
        layer.appendChild(group);
      }
      function stateBadge(node, r) {
        if (r.fault === 'down' && r.failover) return ['ON STANDBY', 'warn'];
        if (r.fault) return [r.fault.toUpperCase(), r.fault === 'degraded' || r.fault === 'brownout' || r.fault === 'surge' ? 'warn' : 'fail'];
        if (r.state === 'failing') return [node.actor ? 'NOT SERVED' : 'FAILING', 'fail'];
        if (r.saturated) return ['SATURATED', 'warn'];
        if (r.state === 'degraded') return ['DEGRADED', 'warn'];
        return null;
      }
      function modeBadge(node, r) {
        if (state.mode === 'performance') {
          if (r.saturated) return ['SATURATED ' + Math.round(r.utilisation * 100) + '%', 'fail'];
          if (r.utilisation != null) return [Math.round(r.utilisation * 100) + '% used', r.utilisation >= 0.8 ? 'warn' : 'info'];
          return r.capacity_rps != null ? ['cap ' + number(r.capacity_rps) + '/s', 'muted'] : null;
        }
        if (state.mode === 'security') {
          if (node.security.public_exposed === true) return ['PUBLIC', 'warn'];
          if (node.security.auth_method === 'none') return ['NO AUTH', 'fail'];
          if (node.security.auth_method) return [node.security.auth_method.toUpperCase(), 'ok'];
          return node.security.trust_zone ? [node.security.trust_zone, 'info'] : null;
        }
        if (state.mode === 'finops') {
          var priced = current.cost.nodes[node.id];
          return priced && priced.priced ? ['$' + number(priced.total_usd) + '/mo', 'info'] : (node.actor ? null : ['no cost data', 'muted']);
        }
        return null;
      }
      function spotlight(nodes, edges, outlineOnly) {
        if (!nodes.length && !edges.length) return;
        if (!outlineOnly) svg.setAttribute('data-wb-spotlight', 'true');
        nodes.forEach(function (id) { var element = nodeElement(id); if (element) element.setAttribute('data-wb-lit', ''); });
        edges.forEach(function (id) { edgeElements(id).forEach(function (element) { element.setAttribute('data-wb-lit', ''); }); });
      }
      function drawOverlays() {
        clearOverlays();
        if (!state.on) return;
        svg.setAttribute('data-wb-mode', state.mode);
        var layer = svgEl('g', { 'data-workbench-overlay': 'badges', 'aria-hidden': 'true' });
        if (state.mode === 'simulate') {
          if (state.sim.arm) svg.setAttribute('data-wb-arm', 'true');
          if (state.sim.ran) {
            var showOption = state.sim.view === 'option' && current.optionResult;
            var result = showOption ? current.optionResult : current.result;
            var waves = current.waves || { of: {}, last: 0 };
            model.nodes.forEach(function (node) {
              var element = nodeElement(node.id); if (!element) return;
              var r = result.nodes[node.id];
              var before = current.result.nodes[node.id];
              if (!showOption && waves.of[node.id] != null && waves.of[node.id] > state.sim.wave) return; // not reached yet
              if (showOption && before.state !== 'ok' && r.state === 'ok' && !r.saturated) {
                element.setAttribute('data-wb-state', 'recovered');
                badge(layer, element, 'RECOVERED', 'ok');
                return;
              }
              if (r.state !== 'ok') element.setAttribute('data-wb-state', r.state);
              if (r.fault) element.setAttribute('data-wb-fault', r.fault);
              var b = stateBadge(node, r);
              if (b) badge(layer, element, b[0], b[1]);
            });
            model.edges.forEach(function (edge) {
              var status = result.edges[edge.id].state;
              if (status === 'ok') return;
              if (!showOption && waves.of[edge.to] != null && waves.of[edge.to] > state.sim.wave) return;
              edgeElements(edge.id).forEach(function (element) { element.setAttribute('data-wb-edge', status); });
            });
            model.boundaries.forEach(function (boundary) {
              var fault = state.sim.faults.boundaries[boundary.id];
              if (fault) frameElements(boundary.id).forEach(function (element) { element.setAttribute('data-wb-fault', fault); });
            });
            var option = showOption || state.sim.option ? selectedOption() : null;
            if (option) spotlight(option.components, option.connections, true);
          } else {
            // Set up, not run: mark what the scenario will inject, without any consequence.
            Object.keys(state.sim.faults.nodes).forEach(function (id) {
              var element = nodeElement(id); if (!element) return;
              element.setAttribute('data-wb-pending', 'true');
              badge(layer, element, 'WILL BE ' + state.sim.faults.nodes[id].toUpperCase(), 'warn');
            });
            Object.keys(state.sim.faults.boundaries).forEach(function (id) {
              frameElements(id).forEach(function (element) { element.setAttribute('data-wb-fault', state.sim.faults.boundaries[id]); });
            });
            Object.keys(state.sim.faults.edges).forEach(function (id) {
              edgeElements(id).forEach(function (element) { element.setAttribute('data-wb-edge', state.sim.faults.edges[id]); });
            });
          }
        } else if (state.mode === 'performance' || state.mode === 'security' || state.mode === 'finops') {
          model.nodes.forEach(function (node) {
            var element = nodeElement(node.id); if (!element) return;
            var r = current.result.nodes[node.id];
            if (state.mode === 'performance' && r.saturated) element.setAttribute('data-wb-state', 'degraded');
            var b = modeBadge(node, r);
            if (b) badge(layer, element, b[0], b[1]);
          });
        } else if (state.mode === 'review' || state.mode === 'optimize') {
          var subject = state.mode === 'review' ? selectedFinding() : selectedChange();
          if (subject) spotlight(subject.affectedNodes || subject.components || [], subject.affectedEdges || subject.connections || []);
        } else if (state.mode === 'decide') {
          var trace = currentTrace();
          if (trace) trace.steps.forEach(function (step, index) {
            if (index > state.trace.step) return;
            edgeElements(step.edge).forEach(function (element) { element.setAttribute('data-wb-edge', index === state.trace.step ? 'trace-current' : 'trace-done'); });
          });
        }
        svg.appendChild(layer);
      }

      // ---- vitals ----------------------------------------------------------------------
      function readout(name, value, was, tone, title) {
        var valueNode = el('strong', { className: 'ame-readout-value', text: value });
        return el('div', { className: 'ame-readout', 'data-tone': tone || null, 'data-readout': name[0], title: title || null }, [
          el('span', { className: 'ame-readout-label', text: name[1] }), valueNode,
          was != null ? el('span', { className: 'ame-readout-was', text: 'healthy: ' + was }) : null,
        ]);
      }
      function drawVitals() {
        var inputs = activeInputs(); var changed = !isBaseline(inputs);
        var b = baselineFigures; var basis = current.result.basis;
        // The bar follows the diagram: under a recovery option it shows the option's figures.
        var option = state.on && state.mode === 'simulate' && state.sim.ran && state.sim.view === 'option' ? selectedOption() : null;
        var shownOption = option && option.previewable && current.optionResult ? option : null;
        var f = shownOption ? shownOption.preview.after : current.figures;
        var k = shownOption ? current.optionResult.kpis : current.result.kpis;
        clear(basisBlock);
        basisBlock.appendChild(el('span', { className: 'ame-basis-line' }, [tag('modelled', 'modelled'), ' not measured']));
        basisBlock.appendChild(el('span', { className: 'ame-basis-line', 'data-workbench-basis': '', text: basis.authored_inputs + ' authored, ' + basis.assumed_inputs + ' assumed inputs' }));
        basisBlock.title = 'Every figure here is computed by an analytical model from the declared design. ' + basis.authored_inputs + ' inputs are stated in the document; ' + basis.assumed_inputs + ' are defaults assumed from each component\'s role. This page contains no measurements.';
        clear(readouts);
        var was = function (key, format) { return changed && b[key] !== f[key] ? format(b[key]) : null; };
        var pct = percent;
        var ms = function (v) { return v == null ? 'not served' : number(v) + ' ms'; };
        var rps = function (v) { return v == null ? 'n/a' : number(v) + '/s'; };
        var usd = function (v) { return v == null ? 'no data' : '$' + number(v); };
        var condition = changed ? conditionText(inputs) + (shownOption ? ', with the change: ' + shownOption.title : '') : '';
        readouts.appendChild(readout(['availability', changed ? 'Answered now' : 'Answered'], pct(f.composite_sla_percent), was('composite_sla_percent', pct),
          f.composite_sla_percent === 0 ? 'critical' : '', changed ? 'Modelled share of requests answered while: ' + condition + '. Baseline: ' + pct(b.composite_sla_percent) + '.' : 'Modelled composite availability of the request path.'));
        readouts.appendChild(readout(['latency', 'Path P99'], ms(f.critical_path_p99_ms), was('critical_path_p99_ms', ms), f.critical_path_p99_ms == null ? 'critical' : '', k.critical_path ? k.critical_path.nodes.map(label).join(' to ') : 'No entry is served.'));
        readouts.appendChild(readout(['load', 'Max load'], rps(f.max_sustainable_rps), was('max_sustainable_rps', rps), k.headroom != null && k.headroom < 1 ? 'critical' : '',
          k.limiting_node ? 'First to reach its capacity: ' + label(k.limiting_node) + (k.ingress_rps != null ? '. Entry load now: ' + number(k.ingress_rps) + '/s.' : '.') : ''));
        readouts.appendChild(readout(['spof', 'Single points'], String(f.single_points_of_failure), was('single_points_of_failure', String), f.single_points_of_failure ? 'warning' : '', k.active_spofs.map(label).join(', ')));
        readouts.appendChild(readout(['cost', 'Cost / month'], usd(f.monthly_cost_usd), was('monthly_cost_usd', usd), '', current.cost.coverage.priced_components + ' of ' + current.cost.coverage.components + ' components carry cost data.'));
        readouts.appendChild(readout(['score', 'Review'], number(f.review_score, 1) + ' / 100', null, current.review.counts.critical ? 'critical' : current.review.counts.high ? 'warning' : '', plural(current.review.findings.length, 'finding')));
        if (changed) {
          basisBlock.appendChild(el('span', { className: 'ame-basis-line', 'data-workbench-condition': '', title: 'Condition: ' + condition, style: 'color:var(' + (shownOption ? '--ame-ok' : '--ame-critical') + ')', text: 'Condition: ' + condition }));
        }
      }

      // ---- inspector: shared pieces ------------------------------------------------
      function kv(rows) {
        return el('table', { className: 'ame-kv' }, [el('tbody', {}, rows.map(function (row) {
          var cell = el('td', {}, [typeof row[1] === 'string' ? row[1] : row[1]]);
          if (row[2]) { cell.appendChild(document.createTextNode(' ')); cell.appendChild(basisTag(row[2])); }
          return el('tr', {}, [el('th', { scope: 'row', text: row[0] }), cell]);
        }))]);
      }
      function table(headers, rows, numeric) {
        var isNum = function (index) { return (numeric || []).indexOf(index) !== -1; };
        return el('div', { className: 'ame-table-wrap' }, [el('table', { className: 'ame-table' }, [
          el('thead', {}, [el('tr', {}, headers.map(function (h, i) { return el('th', { scope: 'col', className: isNum(i) ? 'ame-num' : null, text: h }); }))]),
          el('tbody', {}, rows.map(function (cells) { return el('tr', {}, cells.map(function (c, i) { return el('td', { className: isNum(i) ? 'ame-num' : null }, [c == null ? '' : (typeof c === 'object' ? c : String(c))]); })); })),
        ])]);
      }
      function metricValue(value, unit) {
        if (value == null) return 'n/a';
        if (unit === '%') return percent(value);
        if (unit === 'USD') return '$' + number(value);
        if (unit === 'ms') return number(value) + ' ms';
        if (unit === 'requests/s') return number(value) + '/s';
        return number(value, 1) + (unit ? ' ' + unit : '');
      }
      /** Before and after, one row per figure, with the verdict in words. */
      function compareTable(metrics, beforeLabel, afterLabel, keep) {
        var rows = metrics.filter(function (m) { return !keep || keep(m); }).map(function (m) {
          return [m.label, metricValue(m.before, m.unit), metricValue(m.after, m.unit), tag(m.verdict === 'better' ? 'better' : m.verdict === 'worse' ? 'worse' : 'unchanged', m.verdict)];
        });
        return table(['Figure', beforeLabel, afterLabel, 'Change'], rows, [1, 2]);
      }
      function selectNode(id, options) {
        state.selected = id;
        if (ArchiMadeEasy.focus && ArchiMadeEasy.focus.set && (!options || options.focus !== false)) {
          try { ArchiMadeEasy.focus.set(id, { toggle: false, updateUrl: false }); } catch (error) { /* selection in the inspector still works */ }
        }
      }
      function nodeLink(id) { return el('button', { type: 'button', className: 'ame-link', 'data-workbench-node': id, text: label(id), onclick: function () { selectNode(id); setMode('explore'); } }); }
      function findingCard(finding, selectedId, onSelect) {
        var open = selectedId === finding.id;
        var card = el('button', { type: 'button', className: 'ame-card', 'data-workbench-finding': finding.id, 'aria-expanded': String(open), onclick: function () { onSelect(open ? null : finding.id); } }, [
          el('span', { className: 'ame-card-title' }, [tag(finding.severity, finding.severity), el('span', { text: finding.title })]),
          el('span', { className: 'ame-card-note', text: finding.affectedNodes.map(label).join(', ') || 'Whole design' }),
        ]);
        var item = el('li', {}, [card]);
        if (open) {
          var detail = el('div', { className: 'ame-detail', 'data-workbench-finding-detail': finding.id }, [el('dl', {}, [
            el('div', {}, [el('dt', { text: 'Problem' }), el('dd', {}, [finding.title + '. ', basisTag(finding.basis)])]),
            el('div', {}, [el('dt', { text: 'Evidence' }), el('dd', { text: finding.evidence })]),
            el('div', {}, [el('dt', { text: 'Consequence' }), el('dd', { text: finding.consequence })]),
            el('div', {}, [el('dt', { text: 'Recommended change' }), el('dd', { text: finding.remediation })]),
          ])]);
          if (finding.basis === 'assumed') detail.appendChild(el('p', { className: 'ame-muted', text: 'This finding rests on assumed inputs. Confirm them before acting; it counts half toward the score.' }));
          if (finding.fixes.length) {
            var preview = engine.previewPatches(doc, finding.fixes, {});
            detail.appendChild(el('p', {}, [el('strong', { text: 'If you make this change ' }), tag('modelled', 'modelled')]));
            detail.appendChild(compareTable(preview.metrics, 'Now', 'After', function (m) { return m.verdict !== 'unchanged' && m.verdict !== 'not comparable'; }));
            if (preview.findings.closed.length > 1) detail.appendChild(el('p', { className: 'ame-muted', text: 'It also closes: ' + preview.findings.closed.filter(function (c) { return c.id !== finding.id; }).map(function (c) { return c.title; }).join('; ') + '.' }));
          } else {
            detail.appendChild(el('p', { className: 'ame-muted', text: 'This change needs a figure or a structural decision that only you can supply, so it cannot be previewed.' }));
          }
          item.appendChild(detail);
        }
        return item;
      }
      function selectedFinding() { return current.review ? current.review.findings.filter(function (f) { return f.id === state.finding; })[0] : null; }
      function findingList(findings) {
        if (!findings.length) return el('p', { className: 'ame-muted', text: 'No rule fired here. That means none of the checked rules found a problem, not that this aspect is complete.' });
        return el('ul', { className: 'ame-cards' }, findings.map(function (finding) {
          return findingCard(finding, state.finding, function (id) { state.finding = id; drawInspector(); drawOverlays(); });
        }));
      }

      // ---- inspector: modes ----------------------------------------------------------
      function drawExplore() {
        var node = state.selected && nodeById[state.selected];
        if (!node) {
          body.appendChild(el('p', { className: 'ame-lede', text: 'Select a component on the diagram, or in the list below, to see its properties and dependencies.' }));
          var groups = {};
          model.nodes.forEach(function (n) { (groups[n.role] = groups[n.role] || []).push(n); });
          body.appendChild(section('Components by role', [table(['Role', 'Components'], Object.keys(groups).sort().map(function (role) {
            return [role, el('span', {}, groups[role].map(function (n) { return nodeLink(n.id); }))];
          }))]));
          var basis = baseline.basis;
          body.appendChild(section('About these figures', [
            el('p', {}, [tag('modelled', 'modelled'), ' Every figure in the workbench is computed by an analytical model from this design as declared. It is a prediction to reason with, not an observation.']),
            el('p', {}, [tag('authored', 'authored'), ' ' + basis.authored_inputs + ' inputs are stated in the document.']),
            el('p', {}, [tag('assumed', 'assumed'), ' ' + basis.assumed_inputs + ' inputs are not stated; a default for the component\'s role is used and marked wherever it appears.']),
            el('p', {}, [tag('measured', 'measured'), ' None. This page contains no measurements from a running system.']),
          ]));
          return;
        }
        var r = current.result.nodes[node.id];
        var b = function (key) { return node.basis[key] === 'assumed' ? 'assumed' : 'authored'; };
        var v = function (value, unit) { return value == null ? 'not stated' : value + (unit || ''); };
        body.appendChild(el('p', { className: 'ame-lede' }, [el('strong', { text: node.label }), node.sublabel ? ' ' + node.sublabel : '']));
        body.appendChild(section('Properties', [kv([
          ['Role', node.role, b('role')],
          ['Redundancy', node.redundancy, b('redundancy')],
          ['Availability of one unit', v(node.sla_percent, '%'), node.sla_percent == null ? null : b('sla_percent')],
          ['Capacity', r.capacity_rps == null ? 'not stated' : number(r.capacity_rps) + ' /s', r.capacity_rps == null ? null : b('capacity.max_rps')],
          ['Latency P50 / P99', v(node.latency.p50_ms, ' ms') + ' / ' + v(node.latency.p99_ms, ' ms'), node.latency.p99_ms == null ? null : b('latency.p99_ms')],
          ['Recovery time / point', v(node.dr.rto_sec, ' s') + ' / ' + v(node.dr.rpo_sec, ' s'), node.dr.rto_sec == null ? null : 'authored'],
          ['Security', [node.security.trust_zone ? 'zone ' + node.security.trust_zone : null, node.security.auth_method ? 'auth ' + node.security.auth_method : null,
            node.security.public_exposed ? 'public' : null, node.security.encryption_at_rest ? 'encrypted at rest' : null].filter(Boolean).join(', ') || 'not stated', null],
        ])]));
        body.appendChild(section('Modelled now', [kv([
          ['State', r.state + (r.cause.length ? ': ' + r.cause[r.cause.length - 1] : '')],
          ['Load', r.load_rps == null ? 'no entry load is stated' : number(r.load_rps) + ' /s' + (r.utilisation != null ? ' (' + Math.round(r.utilisation * 100) + '% of capacity)' : '')],
          ['Cost per month', current.cost.nodes[node.id] && current.cost.nodes[node.id].priced ? '$' + number(current.cost.nodes[node.id].total_usd) : 'no cost data'],
        ])]));
        var edgeRow = function (edge, other) { return [nodeLink(other), edge.call_semantics, edge.label || '']; };
        var out = model.edges.filter(function (e) { return e.from === node.id; }); var into = model.edges.filter(function (e) { return e.to === node.id; });
        body.appendChild(section('Depends on (' + out.length + ')', [out.length ? table(['Component', 'Call', 'Label'], out.map(function (e) { return edgeRow(e, e.to); })) : el('p', { className: 'ame-muted', text: 'Nothing.' })]));
        body.appendChild(section('Called by (' + into.length + ')', [into.length ? table(['Component', 'Call', 'Label'], into.map(function (e) { return edgeRow(e, e.from); })) : el('p', { className: 'ame-muted', text: 'Nothing.' })]));
        var reach = function (direction) { return function () { if (ArchiMadeEasy.focus && ArchiMadeEasy.focus.reach) ArchiMadeEasy.focus.reach(direction, { toggle: false, updateUrl: false, reveal: false }); }; };
        body.appendChild(el('div', { className: 'ame-actions' }, [
          button('Show everything upstream', reach('upstream')), button('Show everything downstream', reach('downstream')),
          button('Fail this component', function () { state.sim.scenario = ''; state.sim.faults = emptyFaults(); state.sim.faults.nodes[node.id] = 'down'; state.sim.ran = false; setMode('simulate'); }),
          button('Clear selection', function () { state.selected = null; if (ArchiMadeEasy.focus && ArchiMadeEasy.focus.clear) ArchiMadeEasy.focus.clear({}); drawInspector(); }, { className: 'ame-btn ame-btn--quiet' }),
        ]));
      }

      function drawReview() {
        var review = current.review;
        body.appendChild(el('p', { className: 'ame-lede', text: 'The design checked against ' + review.rules_checked.length + ' rules. Select a finding to see what it affects and what changing it would do.' }));
        body.appendChild(section('Score', [
          el('div', { className: 'ame-score' }, [el('strong', { text: number(review.score, 1) }), el('span', { className: 'ame-muted', text: '/ 100, from ' + plural(review.findings.length, 'finding') })]),
          table(['Pillar', 'Score', ''], Object.keys(review.pillars).map(function (pillar) {
            var p = review.pillars[pillar];
            return [pillar, number(p.score, 1), el('div', { className: 'ame-bar', 'data-tone': p.score < 85 ? 'critical' : p.score < 95 ? 'warning' : null }, [el('span', { style: 'width:' + Math.max(2, p.score) + '%' })])];
          }), [1]),
        ]));
        body.appendChild(section('Findings', [findingList(review.findings)]));
        body.appendChild(el('p', { className: 'ame-muted', text: 'A finding tagged assumed rests on inputs the document does not state.' }));
      }

      function selectedOption() { return current.plan ? current.plan.options.filter(function (o) { return o.id === state.sim.option; })[0] : null; }
      function drawSimulate() {
        var sim = state.sim;
        body.appendChild(el('p', { className: 'ame-lede', text: 'Choose what goes wrong, run the model, then read the impact and try recovery options.' }));
        // 1. Scenario
        var cards = el('ul', { className: 'ame-cards' }, scenarios.map(function (scenario) {
          var note = scenario.applicable ? (scenario.targets.length ? 'Affects: ' + scenario.targets.map(function (id) { var bd = model.boundaries[boundaryIndex[id]]; return bd ? bd.label : label(id); }).join(', ') : (scenario.inputs.multiplier > 1 ? 'Entry load times ' + scenario.inputs.multiplier : '')) : scenario.reason;
          return el('li', {}, [el('button', { type: 'button', className: 'ame-card', 'data-workbench-scenario': scenario.id, 'aria-pressed': String(sim.scenario === scenario.id), disabled: !scenario.applicable, onclick: function () { chooseScenario(sim.scenario === scenario.id ? '' : scenario.id); } }, [
            el('span', { className: 'ame-card-title' }, [el('span', { className: 'ame-num', text: scenario.id.toUpperCase() }), el('span', { text: scenario.title })]),
            el('span', { className: 'ame-card-note', text: scenario.applicable ? note : 'Not applicable: ' + note }),
          ])]);
        }));
        body.appendChild(section('1. Scenario', [cards,
          el('div', { className: 'ame-actions' }, [button(sim.arm ? 'Marking: click components to change their fault' : 'Or mark components on the diagram', function () { sim.arm = !sim.arm; drawInspector(); drawOverlays(); }, { 'aria-pressed': String(sim.arm), 'data-workbench-arm': '' })]),
        ]));
        var slider = function (labelText, id, min, max, value, format, apply) {
          var output = el('output', { 'for': id, text: format(value) });
          var input = el('input', { id: id, type: 'range', min: String(min), max: String(max), step: '1', value: String(value), 'aria-label': labelText });
          input.addEventListener('input', function () { apply(Number(input.value)); output.textContent = format(Number(input.value)); });
          return el('label', { className: 'ame-field' }, [el('span', { text: labelText }), input, output]);
        };
        body.appendChild(section('2. Conditions', [
          slider('Entry load', 'workbench-sim-load', 1, 50, sim.multiplier, function (x) { return x + 'x'; }, function (x) { sim.multiplier = x; sim.scenario = ''; staleSim(); }),
          slider('Cache hits', 'workbench-sim-cache', 0, 99, Math.round(sim.cacheHit * 100), function (x) { return x + '%'; }, function (x) { sim.cacheHit = x / 100; sim.scenario = ''; staleSim(); }),
        ]));
        var pending = [];
        Object.keys(sim.faults.nodes).forEach(function (id) { pending.push(label(id) + ': ' + sim.faults.nodes[id]); });
        Object.keys(sim.faults.edges).forEach(function (id) { pending.push(id + ': ' + sim.faults.edges[id]); });
        Object.keys(sim.faults.boundaries).forEach(function (id) { var bd = model.boundaries[boundaryIndex[id]]; pending.push((bd ? bd.label : id) + ': ' + sim.faults.boundaries[id]); });
        body.appendChild(section('3. Run', [
          el('p', { 'data-workbench-setup': '', className: simIsSet() ? null : 'ame-muted', text: simIsSet() ? 'Set up: ' + conditionText(simInputs()) + '.' : 'Nothing is set up yet. Choose a scenario, mark a component, or change the conditions.' }),
          el('div', { className: 'ame-actions' }, [
            el('button', { type: 'button', className: 'ame-btn ame-btn--primary', 'data-workbench-run': '', disabled: !simIsSet(), onclick: function () { runSimulation(); } }, [icon('play'), sim.ran ? 'Run again' : 'Run scenario']),
            el('button', { type: 'button', className: 'ame-btn', 'data-workbench-reset': '', disabled: !simIsSet() && !sim.ran, onclick: function () { resetSimulation(); } }, [icon('reset'), 'Reset']),
          ]),
        ]));
        if (!sim.ran) return;

        // 4. Impact
        var result = current.result; var k = result.kpis; var affected = k.blast_radius.nodes;
        var summary = affected.length
          ? plural(affected.length, 'component') + ' of ' + model.nodes.length + ' affected.' + (k.blast_radius.ingress_share != null ? ' ' + Math.round(k.blast_radius.ingress_share * 100) + '% of entry traffic is not served.' : '')
          : 'No component is affected under these conditions.';
        var impact = [el('p', { className: 'ame-callout', 'data-tone': affected.length ? 'critical' : 'ok', 'data-workbench-impact': '' }, [tag('modelled', 'modelled'), ' ' + summary])];
        if (affected.length) {
          var waves = current.waves; var ordered = affected.slice().sort(function (a, b2) { return (waves.of[a] - waves.of[b2]) || (a < b2 ? -1 : 1); });
          impact.push(el('ol', { className: 'ame-steps', 'data-workbench-propagation': '' }, ordered.map(function (id) {
            var r = result.nodes[id];
            return el('li', { 'aria-current': waves.of[id] === sim.wave && sim.wave < waves.last ? 'step' : null }, [el('strong', { text: label(id) + ': ' + (r.fault === 'down' && r.failover ? 'on standby' : r.state) }), r.cause.length ? '. ' + r.cause[r.cause.length - 1] : (r.saturated ? '. Load exceeds capacity.' : '')]);
          })));
          if (waves.last > 0) impact.push(el('div', { className: 'ame-actions' }, [button('Replay propagation', function () { playWaves(); })]));
        }
        var events = result.events.map(function (event) {
          return event.type === 'fallback' ? 'Fallback: ' + event.edge + ' switched to ' + event.to
            : event.type === 'dr-failover' ? 'Standby takes over for ' + label(event.node) + ' (recovery time ' + (event.rto_sec == null ? 'not stated' : event.rto_sec + ' s') + ', recovery point ' + (event.rpo_sec == null ? 'not stated' : event.rpo_sec + ' s') + ')'
            : event.type === 'saturation' ? label(event.node) + ' is at ' + Math.round(event.utilisation * 100) + '% of its capacity'
            : event.type === 'queue-lag' ? label(event.node) + ' falls behind by ' + number(event.growth_rps) + ' messages a second'
            : event.type === 'retry-storm' ? 'Retries multiply load on ' + label(event.node) + ' by ' + event.amplification
            : event.type === 'timeout-inversion' ? event.caller + ' gives up before ' + event.callee + ' finishes retrying' : null;
        }).filter(Boolean);
        var scenario = scenarios.filter(function (s) { return s.id === sim.scenario; })[0];
        if (scenario && scenario.analysis) {
          events.push('Reachable from ' + label(scenario.analysis.start) + ' without authentication: ' + (scenario.analysis.reachable_without_authentication.map(label).join(', ') || 'nothing'));
          events.push('Stopped by authentication at: ' + (scenario.analysis.stopped_by_authentication.map(label).join(', ') || 'nothing'));
        }
        if (events.length) impact.push(el('ul', { className: 'ame-list' }, events.map(function (text) { return el('li', { text: text }); })));
        result.warnings.forEach(function (warning) { impact.push(el('p', { className: 'ame-muted', text: 'Model limit: ' + warning })); });
        body.appendChild(section('4. Impact', impact));

        // 5. Before and after
        body.appendChild(section('5. Before and after', [
          compareTable(engine.compareFigures(baselineFigures, current.figures), 'Healthy', 'Scenario', function (m) { return m.metric !== 'review_score' && m.metric !== 'single_points_of_failure'; }),
          el('p', { className: 'ame-muted', text: '"Answered" counts requests that get any answer, including a degraded one.' }),
        ]));

        // 6. Recovery options
        var plan = current.plan; var options = [];
        if (!plan.options.length) options.push(el('p', { className: 'ame-muted', text: affected.length ? 'The model has no change to suggest for this failure.' : 'Nothing to recover from.' }));
        else options.push(el('ul', { className: 'ame-cards' }, plan.options.map(function (option) {
          var open = sim.option === option.id;
          var lead = option.previewable ? option.preview.metrics.filter(function (m) { return m.metric === 'affected_components'; })[0] : null;
          var item = el('li', {}, [el('button', { type: 'button', className: 'ame-card', 'data-workbench-option': option.id, 'aria-expanded': String(open), onclick: function () { chooseOption(open ? null : option.id); } }, [
            el('span', { className: 'ame-card-title' }, [el('span', { text: option.title })]),
            el('span', { className: 'ame-card-note', text: lead ? 'Components affected: ' + lead.before + ' to ' + lead.after : 'Needs figures from you; not previewed' }),
          ])]);
          if (open) {
            var detail = el('div', { className: 'ame-detail', 'data-workbench-option-detail': option.id }, [el('p', { text: option.rationale })]);
            if (option.previewable) {
              detail.appendChild(el('p', {}, [el('strong', { text: 'Same failure, with this change ' }), tag('modelled', 'modelled')]));
              detail.appendChild(compareTable(option.preview.metrics, 'As declared', 'With change', function (m) { return m.verdict !== 'unchanged' && m.verdict !== 'not comparable'; }));
              detail.appendChild(el('div', { className: 'ame-actions', role: 'group', 'aria-label': 'Diagram shows' }, [
                button('Diagram: as declared', function () { sim.view = 'scenario'; drawVitals(); drawInspector(); drawOverlays(); }, { 'aria-pressed': String(sim.view === 'scenario'), 'data-workbench-view': 'scenario' }),
                button('Diagram: with this change', function () { sim.view = 'option'; drawVitals(); drawInspector(); drawOverlays(); }, { 'aria-pressed': String(sim.view === 'option'), 'data-workbench-view': 'option' }),
              ]));
            }
            detail.appendChild(el('p', { className: 'ame-muted', text: plan.note }));
            item.appendChild(detail);
          }
          return item;
        })));
        body.appendChild(section('6. Recovery options', options));
      }

      function drawSecurity() {
        var findings = current.review.findings.filter(function (f) { return f.pillars.indexOf('Security') !== -1; });
        body.appendChild(el('p', { className: 'ame-lede', text: 'What is reachable from outside and what protects it, as the document declares it.' }));
        var exposed = model.nodes.filter(function (n) { return n.security.public_exposed === true || model.entrypoints.indexOf(n.id) !== -1; });
        body.appendChild(section('Entry points', [exposed.length ? el('ul', { className: 'ame-facts' }, exposed.map(function (n) {
          var reach = engine.breachReach(model, n.id);
          return el('li', {}, [
            el('span', {}, [nodeLink(n.id), ' ', n.security.public_exposed === true ? tag('authored', 'declared public') : tag('assumed', 'assumed entry')]),
            el('span', { className: 'ame-fact-line', text: 'Reaches without authentication: ' + (reach.reachable_without_authentication.map(label).join(', ') || 'nothing') }),
            el('span', { className: 'ame-fact-line', text: 'Stopped by authentication at: ' + (reach.stopped_by_authentication.map(label).join(', ') || 'nothing') }),
          ]);
        })) : el('p', { className: 'ame-muted', text: 'No entry point.' }),
        el('p', { className: 'ame-muted', text: 'Reach follows declared connections until a component that declares an authentication method.' })]));
        var stated = function (value) { return value === true ? 'yes' : value === false ? 'no' : 'not stated'; };
        body.appendChild(section('Protection declared', [table(['Component', 'Sign-in', 'At rest', 'In transit'], model.nodes.filter(function (n) { return !n.actor; }).map(function (n) {
          return [nodeLink(n.id), n.security.auth_method || 'not stated', stated(n.security.encryption_at_rest), stated(n.security.encryption_in_transit)];
        }))]));
        body.appendChild(section('Security findings', [findingList(findings)]));
        body.appendChild(el('p', { className: 'ame-muted', text: '"Not stated" means the document says nothing; it is not evidence that the protection is missing or present.' }));
      }

      function drawPerformance() {
        var perf = state.perf; var result = current.result; var k = result.kpis;
        body.appendChild(el('p', { className: 'ame-lede', text: 'Change the load and the cache hit ratio; the diagram and figures follow as you move.' }));
        var slider = function (labelText, id, min, max, value, format, apply) {
          var output = el('output', { 'for': id, text: format(value) });
          var input = el('input', { id: id, type: 'range', min: String(min), max: String(max), step: '1', value: String(value), 'aria-label': labelText });
          input.addEventListener('input', function () { apply(Number(input.value)); output.textContent = format(Number(input.value)); refresh({ keepInspector: true }); drawPerformanceResults(results); });
          return el('label', { className: 'ame-field' }, [el('span', { text: labelText }), input, output]);
        };
        body.appendChild(section('Conditions', [
          slider('Entry load', 'workbench-perf-load', 1, 50, perf.multiplier, function (x) { return x + 'x'; }, function (x) { perf.multiplier = x; }),
          slider('Cache hits', 'workbench-perf-cache', 0, 99, Math.round(perf.cacheHit * 100), function (x) { return x + '%'; }, function (x) { perf.cacheHit = x / 100; }),
          el('div', { className: 'ame-actions' }, [button('Back to 1x, no cache', function () { perf.multiplier = 1; perf.cacheHit = 0; refresh(); })]),
        ]));
        var results = el('div', { 'data-workbench-performance': '' });
        body.appendChild(results);
        drawPerformanceResults(results);
        if (!result.basis.load_known && k) body.appendChild(el('p', { className: 'ame-callout', text: 'No entry load is stated in this document, so load and utilisation cannot be shown. State capacity.baseline_rps on an entry component to see them.' }));
      }
      function drawPerformanceResults(target) {
        clear(target);
        var result = current.result; var k = result.kpis;
        var path = k.critical_path;
        target.appendChild(section('Critical path', [path ? table(['Step', 'Component', 'P99 alone'], path.nodes.map(function (id, index) {
          return [String(index + 1), nodeLink(id), nodeById[id] && nodeById[id].latency.p99_ms != null ? number(nodeById[id].latency.p99_ms) + ' ms' : ''];
        }), [2]) : el('p', { className: 'ame-muted', text: 'No entry is served under these conditions.' }),
        path ? el('p', {}, ['End to end: ', el('strong', { className: 'ame-num', text: 'P50 ' + number(path.p50_ms) + ' ms, P95 ' + number(path.p95_ms) + ' ms, P99 ' + number(path.p99_ms) + ' ms' }), ' ', tag('modelled', 'modelled')]) : null]));
        var loaded = model.nodes.filter(function (n) { return result.nodes[n.id].utilisation != null; }).sort(function (a, b2) { return result.nodes[b2.id].utilisation - result.nodes[a.id].utilisation; });
        target.appendChild(section('Utilisation', [loaded.length ? table(['Component', 'Load', 'Capacity', 'Used', ''], loaded.map(function (n) {
          var r = result.nodes[n.id]; var used = Math.round(r.utilisation * 100);
          return [n.label, number(r.load_rps) + '/s', number(r.capacity_rps) + '/s', used + '%', el('div', { className: 'ame-bar', 'data-tone': used >= 100 ? 'critical' : used >= 80 ? 'warning' : null }, [el('span', { style: 'width:' + Math.min(100, Math.max(2, used)) + '%' })])];
        }), [1, 2, 3]) : el('p', { className: 'ame-muted', text: 'No utilisation to show without a stated entry load.' })]));
        target.appendChild(section('Headroom', [el('p', {}, [k.max_sustainable_rps == null ? 'Not available.' : 'The design sustains about ', k.max_sustainable_rps == null ? null : el('strong', { className: 'ame-num', text: number(k.max_sustainable_rps) + ' requests a second' }),
          k.limiting_node ? '. The first component to reach its capacity is ' + label(k.limiting_node) + (nodeById[k.limiting_node].basis['capacity.max_rps'] === 'assumed' ? ' (its capacity is assumed).' : '.') : ''])]));
        target.appendChild(section('Performance findings', [findingList(current.review.findings.filter(function (f) { return f.pillars.indexOf('Performance') !== -1; }))]));
      }

      function drawFinops() {
        var cost = current.cost;
        body.appendChild(el('p', { className: 'ame-lede', text: 'Monthly cost, from the prices the document states. Components without cost data are listed, not estimated.' }));
        body.appendChild(section('Total', [el('div', { className: 'ame-score' }, [el('strong', { text: cost.monthly_total_usd == null ? 'no data' : '$' + number(cost.monthly_total_usd) }), el('span', { className: 'ame-muted', text: 'a month, covering ' + cost.coverage.priced_components + ' of ' + cost.coverage.components + ' components' })]),
          cost.coverage.priced_components < cost.coverage.components ? el('p', { className: 'ame-callout', text: 'This total is incomplete: ' + (cost.coverage.components - cost.coverage.priced_components) + ' components carry no cost data.' }) : null]));
        var priced = model.nodes.filter(function (n) { return cost.nodes[n.id] && cost.nodes[n.id].priced; }).sort(function (a, b2) { return cost.nodes[b2.id].total_usd - cost.nodes[a.id].total_usd; });
        var total = cost.monthly_total_usd || 1;
        body.appendChild(section('By component', [priced.length ? table(['Component', 'Per month', 'Share', ''], priced.map(function (n) {
          var c = cost.nodes[n.id]; var share = Math.round((c.total_usd / total) * 100);
          return [nodeLink(n.id), '$' + number(c.total_usd), share + '%', el('div', { className: 'ame-bar' }, [el('span', { style: 'width:' + Math.max(2, share) + '%' })])];
        }), [1, 2]) : el('p', { className: 'ame-muted', text: 'No component carries cost data.' })]));
        var egress = Object.keys(cost.egress || {});
        if (egress.length) body.appendChild(section('Data transfer', [table(['Connection', 'GB per month', 'Per month'], egress.map(function (id) { return [id, number(cost.egress[id].gb_per_month, 1), '$' + number(cost.egress[id].cost_usd, 2)]; }), [1, 2])]));
        var unpriced = model.nodes.filter(function (n) { return !n.actor && !(cost.nodes[n.id] && cost.nodes[n.id].priced); });
        if (unpriced.length) body.appendChild(section('No cost data', [el('p', { className: 'ame-muted', text: unpriced.map(function (n) { return n.label; }).join(', ') + '.' })]));
        body.appendChild(section('Cost findings', [findingList(current.review.findings.filter(function (f) { return f.pillars.indexOf('Cost') !== -1; }))]));
      }

      function changes() {
        if (current.changes) return current.changes;
        current.changes = current.review.findings.filter(function (f) { return f.fixes.length; }).map(function (finding) {
          var preview = engine.previewPatches(doc, finding.fixes, {});
          var score = preview.metrics.filter(function (m) { return m.metric === 'review_score'; })[0];
          return { id: finding.id, finding: finding, title: finding.fixes.length === 1 ? finding.fixes[0].summary : finding.remediation.split('.')[0], preview: preview, gain: score.change || 0,
            affectedNodes: finding.affectedNodes, affectedEdges: finding.affectedEdges };
        }).sort(function (a, b2) { return (b2.gain - a.gain) || (a.id < b2.id ? -1 : 1); });
        return current.changes;
      }
      function selectedChange() { return state.change ? changes().filter(function (c) { return c.id === state.change; })[0] : null; }
      function drawOptimize() {
        var list = changes();
        body.appendChild(el('p', { className: 'ame-lede', text: 'Changes the model can preview, ordered by how much each raises the review score.' }));
        if (!list.length) body.appendChild(el('p', { className: 'ame-muted', text: 'No previewable change. See Review for findings that need a decision from you.' }));
        else {
          body.appendChild(section('Changes', [el('ul', { className: 'ame-cards' }, list.map(function (change) {
            var open = state.change === change.id;
            var item = el('li', {}, [el('button', { type: 'button', className: 'ame-card', 'data-workbench-change': change.id, 'aria-expanded': String(open), onclick: function () { state.change = open ? null : change.id; drawInspector(); drawOverlays(); } }, [
              el('span', { className: 'ame-card-title' }, [tag('better', '+' + number(change.gain, 1)), el('span', { text: change.title })]),
              el('span', { className: 'ame-card-note', text: 'Closes: ' + change.finding.title }),
            ])]);
            if (open) item.appendChild(el('div', { className: 'ame-detail', 'data-workbench-change-detail': change.id }, [
              el('p', {}, [el('strong', { text: 'Why. ' }), change.finding.consequence]),
              el('p', {}, [el('strong', { text: 'If you make this change ' }), tag('modelled', 'modelled')]),
              compareTable(change.preview.metrics, 'Now', 'After', function (m) { return m.verdict !== 'unchanged' && m.verdict !== 'not comparable'; }),
              el('p', { className: 'ame-muted', text: change.preview.note }),
            ]));
            return item;
          }))]));
          var all = []; var seen = {};
          list.forEach(function (change) { change.finding.fixes.forEach(function (fix) { var key = fix.target + ':' + fix.id + ':' + JSON.stringify(fix.operational); if (!seen[key]) { seen[key] = true; all.push(fix); } }); });
          var combined = engine.previewPatches(doc, all, {});
          body.appendChild(section('All ' + list.length + ' together', [compareTable(combined.metrics, 'Now', 'After', function (m) { return m.verdict !== 'not comparable'; })]));
        }
        var manual = current.review.findings.filter(function (f) { return !f.fixes.length; });
        if (manual.length) body.appendChild(section('Needs a decision from you', [el('ul', { className: 'ame-list' }, manual.map(function (f) { return el('li', {}, [el('strong', { text: f.title + '. ' }), f.remediation]); }))]));
        body.appendChild(el('p', { className: 'ame-muted', text: 'Previews change the model only. To keep a change, edit the architecture document and render it again.' }));
      }

      function currentTrace() {
        if (!model.traces.length) return null;
        var trace = model.traces.filter(function (t) { return t.id === state.trace.id; })[0] || model.traces[0];
        state.trace.id = trace.id;
        state.trace.step = Math.max(0, Math.min(trace.steps.length - 1, state.trace.step));
        return trace;
      }
      function setTrace(id, step) { state.trace = { id: id, step: step }; drawInspector(); drawOverlays(); }
      function drawDecide() {
        body.appendChild(el('p', { className: 'ame-lede', text: 'The decisions, options and request paths the document records.' }));
        var adrs = model.adrs.length ? model.adrs.map(function (adr) {
          var parts = [el('p', {}, [el('strong', { text: adr.title + ' ' }), tag('quiet', adr.status)])];
          if (adr.context) parts.push(el('p', {}, [el('strong', { text: 'Context. ' }), adr.context]));
          parts.push(el('p', {}, [el('strong', { text: 'Decision. ' }), adr.decision]));
          if (adr.alternatives && adr.alternatives.length) parts.push(table(['Option', 'For', 'Against'], adr.alternatives.map(function (a) { return [a.option, (a.pros || []).join('; '), (a.cons || []).join('; ')]; })));
          if (adr.consequences) parts.push(el('p', {}, [el('strong', { text: 'Consequences. ' }), adr.consequences]));
          return el('div', { className: 'ame-detail' }, parts);
        }) : [el('p', { className: 'ame-muted', text: 'No decision record is authored in this document.' })];
        body.appendChild(section('Decisions', adrs));
        var alternatives = [];
        if (!model.alternatives.length) alternatives.push(el('p', { className: 'ame-muted', text: 'No alternative is authored in this document.' }));
        else {
          if (!current.alternatives) current.alternatives = engine.compareAlternatives(doc);
          current.alternatives.alternatives.forEach(function (alternative) {
            alternatives.push(el('p', {}, [el('strong', { text: alternative.title }), alternative.description ? '. ' + alternative.description : '']));
            alternatives.push(compareTable(alternative.metrics, 'Authored', 'Alternative', function (m) { return m.verdict !== 'not comparable'; }));
          });
        }
        body.appendChild(section('Alternatives', alternatives));
        var trace = currentTrace(); var traces = [];
        if (!trace) traces.push(el('p', { className: 'ame-muted', text: 'No request trace is authored in this document.' }));
        else {
          var select = el('select', { 'aria-label': 'Trace' });
          model.traces.forEach(function (t) { var option = el('option', { value: t.id, text: t.title + ' (' + (t.kind === 'failover' ? 'failover path' : 'normal path') + ')' }); if (t.id === trace.id) option.selected = true; select.appendChild(option); });
          select.addEventListener('change', function () { setTrace(select.value, 0); });
          traces.push(el('div', { className: 'ame-actions' }, [select,
            button('Previous', function () { setTrace(trace.id, state.trace.step - 1); }, { 'data-workbench-trace': 'previous', disabled: state.trace.step === 0 }),
            button('Next', function () { setTrace(trace.id, state.trace.step + 1); }, { 'data-workbench-trace': 'next', disabled: state.trace.step === trace.steps.length - 1 })]));
          traces.push(el('ol', { className: 'ame-steps' }, trace.steps.map(function (step, index) {
            var edge = model.edges[edgeIndex[step.edge]];
            return el('li', { 'aria-current': index === state.trace.step ? 'step' : null }, [el('strong', { text: label(edge.from) + ' to ' + label(edge.to) }), step.note ? ': ' + step.note : '']);
          })));
        }
        body.appendChild(section('Request traces', traces));
      }

      function download(name, text, type) {
        var link = el('a', { href: URL.createObjectURL(new Blob([text], { type: type })), download: name });
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(function () { URL.revokeObjectURL(link.href); }, 1000);
      }
      function drawHandoff() {
        var slug = (model.title || 'architecture').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'architecture';
        var formats = [
          ['Mermaid', 'Flowchart, C4 and sequence, as Markdown', slug + '.mermaid.md', 'text/markdown', function () { return engine.toMermaidMarkdown(model); }],
          ['draw.io', 'Editable diagram for diagrams.net', slug + '.drawio', 'application/xml', function () { return engine.toDrawio(doc, model); }],
          ['Structurizr', 'C4 model as Structurizr DSL', 'workspace.dsl', 'text/plain', function () { return engine.toStructurizr(model); }],
          ['Design document', 'Review-ready write-up, as Markdown', slug + '.rfc.md', 'text/markdown', function () { return engine.toRfc(doc, model); }],
        ];
        body.appendChild(el('p', { className: 'ame-lede', text: 'Download this architecture for other tools. Images (SVG, PNG and more) are in Export, in the command bar.' }));
        body.appendChild(section('Formats', [el('ul', { className: 'ame-cards' }, formats.map(function (format) {
          return el('li', {}, [el('button', { type: 'button', className: 'ame-card', 'data-workbench-export': format[2], onclick: function () { download(format[2], format[4](), format[3]); } }, [
            el('span', { className: 'ame-card-title' }, [el('span', { text: format[0] })]), el('span', { className: 'ame-card-note', text: format[1] + ' (' + format[2] + ')' }),
          ])]);
        }))]));
        body.appendChild(el('p', { className: 'ame-muted', text: 'The design document includes modelled figures, labelled as modelled.' }));
      }

      var DRAW = { explore: drawExplore, review: drawReview, simulate: drawSimulate, security: drawSecurity, performance: drawPerformance, finops: drawFinops, optimize: drawOptimize, decide: drawDecide, handoff: drawHandoff };
      function drawInspector() {
        if (!state.on || !state.inspector) return;
        var scroll = body.scrollTop;
        clear(body);
        var entry = MODES.filter(function (m) { return m[0] === state.mode; })[0];
        inspectorTitle.textContent = entry[1];
        if (state.selected && state.mode !== 'explore' && nodeById[state.selected]) {
          body.appendChild(el('p', { className: 'ame-callout' }, ['Selected: ', el('strong', { text: label(state.selected) }), ' ', el('button', { type: 'button', className: 'ame-btn ame-btn--quiet', text: 'Open in Explore', onclick: function () { setMode('explore'); } })]));
        }
        DRAW[state.mode]();
        body.scrollTop = scroll;
      }
      function drawRail() {
        MODES.forEach(function (entry) {
          var active = state.on && state.mode === entry[0];
          railButtons[entry[0]].setAttribute('aria-pressed', String(active));
          railButtons[entry[0]].setAttribute('aria-expanded', String(active && state.inspector));
        });
        var review = current.review;
        var count = railButtons.review.querySelector('.ame-rail-count');
        if (count) count.remove();
        if (review && review.findings.length) railButtons.review.appendChild(el('span', { className: 'ame-rail-count', 'data-tone': review.counts.critical || review.counts.high ? null : 'warning', 'aria-label': plural(review.findings.length, 'finding'), text: String(review.findings.length) }));
      }

      // ---- state changes ---------------------------------------------------------------
      function relayout() {
        // The regions changed size: let the reader refit the canvas and the canvas tools re-seat.
        try { window.dispatchEvent(new Event('resize')); } catch (error) { /* older engines: the next real resize refits */ }
        var chrome = ArchiMadeEasy.viewerChromeLayout;
        if (chrome && chrome.scheduleLift) chrome.scheduleLift();
      }
      function refresh(options) {
        run();
        drawRail();
        drawVitals();
        if (!options || !options.keepInspector) drawInspector();
        drawOverlays();
      }
      function applyChrome() {
        var before = [html.getAttribute('data-workbench'), html.getAttribute('data-ame-inspector')].join('|');
        if (state.on) html.setAttribute('data-workbench', 'on'); else html.removeAttribute('data-workbench');
        if (state.on && state.inspector) html.setAttribute('data-ame-inspector', 'open'); else html.removeAttribute('data-ame-inspector');
        vitals.hidden = !state.on;
        if (toggle) toggle.setAttribute('aria-pressed', String(state.on));
        inspector.hidden = !(state.on && state.inspector);
        if (before !== [html.getAttribute('data-workbench'), html.getAttribute('data-ame-inspector')].join('|')) relayout();
      }
      function setOn(on) {
        state.on = Boolean(on);
        if (!state.on) { state.inspector = false; stopPlay(); }
        applyChrome();
        if (state.on) refresh(); else { drawRail(); clearOverlays(); }
      }
      function setInspector(open) { state.inspector = Boolean(open) && state.on; applyChrome(); drawRail(); drawInspector(); }
      function setMode(mode) {
        mode = MODE_ALIASES[mode] || mode;
        if (!DRAW[mode]) return;
        if (mode !== state.mode) { stopPlay(); state.finding = null; state.change = null; }
        state.mode = mode; state.on = true; state.inspector = true;
        applyChrome();
        refresh();
      }
      function stopPlay() { if (playTimer) { clearInterval(playTimer); playTimer = 0; } }
      function staleSim() { stopPlay(); state.sim.ran = false; state.sim.option = null; state.sim.view = 'scenario'; current.plan = null; current.optionResult = null; refresh({ keepInspector: true }); syncSetup(); }
      /** The set-up line and buttons follow the sliders without rebuilding the sliders themselves. */
      function syncSetup() {
        var setup = body.querySelector('[data-workbench-setup]'); var runButton = body.querySelector('[data-workbench-run]'); var resetButton = body.querySelector('[data-workbench-reset]');
        if (setup) setup.textContent = simIsSet() ? 'Set up: ' + conditionText(simInputs()) + '.' : 'Nothing is set up yet. Choose a scenario, mark a component, or change the conditions.';
        if (runButton) runButton.disabled = !simIsSet();
        if (resetButton) resetButton.disabled = !simIsSet() && !state.sim.ran;
      }
      function chooseScenario(id) {
        var scenario = scenarios.filter(function (s) { return s.id === id && s.applicable; })[0];
        stopPlay();
        state.sim.scenario = scenario ? scenario.id : '';
        state.sim.faults = emptyFaults(); state.sim.multiplier = 1; state.sim.cacheHit = 0;
        if (scenario) {
          state.sim.multiplier = scenario.inputs.multiplier; state.sim.cacheHit = scenario.inputs.cacheHit;
          ['nodes', 'edges', 'boundaries'].forEach(function (key) { Object.assign(state.sim.faults[key], scenario.inputs.faults[key] || {}); });
        }
        state.sim.ran = false; state.sim.option = null; state.sim.view = 'scenario'; current.plan = null; current.optionResult = null;
        refresh();
      }
      function setFault(kind, id, fault) {
        var table_ = state.sim.faults[{ node: 'nodes', edge: 'edges', boundary: 'boundaries' }[kind]];
        if (!table_ || engine.FAULT_STATES.indexOf(fault) === -1) return;
        if (fault === 'healthy') delete table_[id]; else table_[id] = fault;
        state.sim.scenario = '';
        state.sim.ran = false; state.sim.option = null; state.sim.view = 'scenario'; current.plan = null; current.optionResult = null;
        stopPlay();
        refresh();
      }
      function cycleFault(kind, id) {
        var table_ = state.sim.faults[{ node: 'nodes', edge: 'edges', boundary: 'boundaries' }[kind]];
        setFault(kind, id, CYCLE[(CYCLE.indexOf(table_[id] || 'healthy') + 1) % CYCLE.length]);
      }
      function playWaves(instant) {
        stopPlay();
        var waves = current.waves;
        if (!waves || instant || reducedMotion() || waves.last === 0) { state.sim.wave = waves ? waves.last : 0; drawInspector(); drawOverlays(); return; }
        state.sim.wave = 0; drawInspector(); drawOverlays();
        playTimer = setInterval(function () {
          state.sim.wave += 1;
          if (state.sim.wave >= waves.last) stopPlay();
          drawInspector(); drawOverlays();
        }, 350);
      }
      function runSimulation(options) {
        if (!simIsSet()) return false;
        state.mode = 'simulate'; state.on = true; state.inspector = true;
        state.sim.ran = true; state.sim.option = null; state.sim.view = 'scenario'; current.optionResult = null;
        applyChrome();
        run();
        current.waves = wavesFor(current.result);
        current.plan = engine.recoveryPlan(doc, simInputs());
        drawRail(); drawVitals();
        playWaves(options && options.instant);
        announcer.textContent = plural(current.result.kpis.blast_radius.nodes.length, 'component') + ' affected. Modelled result.';
        return true;
      }
      function resetSimulation() {
        stopPlay();
        state.sim = { scenario: '', faults: emptyFaults(), multiplier: 1, cacheHit: 0, arm: false, ran: false, wave: 0, option: null, view: 'scenario' };
        current.plan = null; current.waves = null; current.optionResult = null;
        refresh();
      }
      function chooseOption(id) {
        state.sim.option = id; state.sim.view = 'scenario'; current.optionResult = null;
        var option = selectedOption();
        if (option && option.previewable) current.optionResult = engine.simulate(engine.buildModel(engine.applyPatches(doc, option.patches)).model, simInputs());
        drawVitals(); drawInspector(); drawOverlays();
      }

      // ---- canvas interaction ----------------------------------------------------------
      function hit(target) {
        if (!target || !target.closest) return null;
        var node = target.closest('[data-node-id]');
        if (node && nodeById[node.getAttribute('data-node-id')]) return { kind: 'node', id: node.getAttribute('data-node-id') };
        var edgeElement = target.closest('[data-edge-id], [data-edge-key]');
        if (edgeElement) {
          var authored = edgeElement.getAttribute('data-edge-id');
          var edge = authored && edgeIndex[authored] != null ? model.edges[edgeIndex[authored]] : model.edges[Number(edgeElement.getAttribute('data-edge-key'))];
          if (edge) return { kind: 'edge', id: edge.id };
        }
        var frame = target.closest('[data-composition-frame-id]');
        if (frame) {
          var boundary = model.boundaries[Number(frame.getAttribute('data-composition-frame-id'))];
          if (boundary) return { kind: 'boundary', id: boundary.id };
        }
        return null;
      }
      function onActivate(event) {
        if (!state.on) return;
        if (container.getAttribute('data-just-panned') === 'true') return;
        var target = hit(event.target);
        if (!target) return;
        if (state.mode === 'simulate' && state.sim.arm) {
          // While marking, activation sets a fault instead of selecting.
          event.preventDefault();
          event.stopImmediatePropagation();
          cycleFault(target.kind, target.id);
        } else if (target.kind === 'node') {
          state.selected = target.id;
          if (state.mode === 'explore') { state.inspector = true; applyChrome(); drawRail(); }
          drawInspector();
        }
      }
      svg.addEventListener('click', onActivate, true);
      svg.addEventListener('keydown', function (event) { if ((event.key === 'Enter' || event.key === ' ') && state.on) onActivate(event); }, true);

      // ---- start -----------------------------------------------------------------------
      current.review = engine.review(model, {});
      current.cost = engine.estimateCost(model, baseline);
      drawRail();
      var requested = null;
      try { requested = new URLSearchParams(window.location.search).get('workbench'); } catch (error) { requested = null; }
      if (requested != null) setMode(DRAW[MODE_ALIASES[requested] || requested] ? requested : 'explore');
      else if (model.authored && html.getAttribute('data-embed') !== 'true') setOn(true);

      return {
        available: true,
        isOn: function () { return state.on; },
        isOpen: function () { return state.on && state.inspector; },
        on: function () { setOn(true); }, off: function () { setOn(false); },
        setMode: setMode, setInspector: setInspector,
        select: function (id) { if (nodeById[id]) { selectNode(id); drawInspector(); } },
        chooseScenario: chooseScenario, setFault: setFault, arm: function (armed) { state.sim.arm = Boolean(armed); drawInspector(); drawOverlays(); },
        setConditions: function (multiplier, cacheHit) { state.sim.multiplier = multiplier; if (cacheHit != null) state.sim.cacheHit = cacheHit; state.sim.scenario = ''; staleSim(); drawInspector(); },
        run: function (options) { return runSimulation(options || { instant: true }); },
        reset: resetSimulation, chooseOption: chooseOption,
        setLoad: function (multiplier, cacheHit) { state.perf.multiplier = multiplier; if (cacheHit != null) state.perf.cacheHit = cacheHit; refresh(); },
        selectFinding: function (id) { state.finding = id; drawInspector(); drawOverlays(); },
        selectChange: function (id) { state.change = id; drawInspector(); drawOverlays(); },
        setTrace: setTrace,
        // Height of the viewport floor that workbench regions cover: the vitals bar, and on
        // narrow screens the tab bar and the open sheet. The canvas tools stay above it.
        viewportInset: function () {
          if (!state.on) return 0;
          var floor = window.innerHeight; var top = floor;
          [vitals, rail, inspector].forEach(function (region) {
            var r = region.getBoundingClientRect();
            // Only regions anchored to the bottom edge count; the side rail and docked inspector do not.
            if (r.height > 0 && r.bottom >= floor - 1 && r.top > floor * 0.2) top = Math.min(top, r.top);
          });
          return floor - top;
        },
        state: function () { return JSON.parse(JSON.stringify(state)); },
        inputs: function () { return JSON.parse(JSON.stringify(activeInputs())); },
        result: function () { return current.result; },
        figures: function () { return current.figures; },
        baseline: function () { return baselineFigures; },
        review: function () { return current.review; },
        plan: function () { return current.plan; },
        changes: function () { return changes().map(function (c) { return { id: c.id, title: c.title, gain: c.gain }; }); },
        model: function () { return model; },
      };
    })();
