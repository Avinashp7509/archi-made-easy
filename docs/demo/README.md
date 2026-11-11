# Interactive demo: what happens if the database fails?

Published at <https://avinashp7509.github.io/archi-made-easy/demo/> by [`.github/workflows/demo-pages.yml`](../../.github/workflows/demo-pages.yml).

One journey for a first-time visitor, with no install, login or key:

1. Read a small online shop checkout: shoppers, API gateway, checkout service, orders database, payment provider, order queue, fulfilment.
2. Press **What happens if the database fails?** The diagram marks the database `DOWN`, the checkout service and gateway `FAILING` and shoppers `NOT SERVED`, one dependency step at a time; the panel says in plain words what fails (every checkout) and what keeps running (payments, the queue, fulfilment of orders already queued).
3. Press **Compare: add a standby database.** The same failure with a standby: the diagram shows the takeover, a table compares the modelled figures, and four trade-offs are spelled out (not instant, the last orders can be lost, a second database to pay for, takeover has to be tested), with why circuit breakers do not fix this failure.
4. **Create this for your system**: the install command and a request to give an agent.

Shareable states: [`#database-fails`](https://avinashp7509.github.io/archi-made-easy/demo/#database-fails) and [`#with-standby`](https://avinashp7509.github.io/archi-made-easy/demo/#with-standby). [`?full`](https://avinashp7509.github.io/archi-made-easy/demo/?full) opens the same page with the whole workbench.

## How it is built

- [`index.html`](index.html) is the architecture document [`checkout.architecture.json`](checkout.architecture.json) rendered by the skill's own renderer, with a guided layer added by [`scripts/build-demo.mjs`](../../scripts/build-demo.mjs) from [`scripts/demo/`](../../scripts/demo/). Nothing in the skill changes. The failure and the takeover are drawn by the page's own workbench; every figure in the panel comes from the same engine the workbench and the command line use.
- The design is illustrative. Availability, capacity and latency are the model's planning defaults for each kind of component, labelled ASSUMED; no prices are stated, so cost is not modelled, and the page says so. The comparison is the engine's own recovery option for this failure (`standby:orders_db`).
- [`preview.png`](preview.png) is a screenshot of the page in the `#database-fails` state at 1200 × 630, used as the link preview.

## Checks

- `node scripts/build-demo.mjs --check`: the published page is what its sources build. The Pages workflow refuses to deploy otherwise.
- [`test/demo.test.mjs`](../../test/demo.test.mjs): the page passes the nine artifact checks, and the model facts its wording depends on hold (what fails, what keeps running, that the standby removes the failure, that the takeover time and data loss are not stated, that the availability inputs are assumed).
- [`test/demo-browser.test.mjs`](../../test/demo-browser.test.mjs), in real Chrome: the failure, the comparison, the diagram switch, start again, a shared `#with-standby` link, the phone layout (question before the diagram, no sideways scrolling, diagram labels at least 7.5px) and `?full`.

## Measured on 2026-11-11 (Windows 11, Chrome, local server)

| | Desktop 1440 × 900 | Phone 390 × 844, 4× CPU slowdown, 10 Mbit/s |
|---|---|---|
| First contentful paint | about 230 ms | 1.1 to 1.3 s |
| Ready to use | about 300 ms | 2.9 to 3.8 s |
| Press "What happens…" to next frame | 29 to 33 ms | 158 to 306 ms |
| Press "Compare…" to next frame | 41 to 45 ms | 211 to 351 ms |

Three runs each, with the page sent uncompressed (1.16 MB). The phone figures are an emulation, not a real device.

Against the published site (GitHub Pages sends the page gzip-compressed, 299 KB), same phone emulation, three fresh visits:

| | Phone 390 × 844, 4× CPU slowdown, 10 Mbit/s |
|---|---|
| First contentful paint | 0.43 to 0.76 s |
| Ready to use | 2.3 to 3.3 s |
| Press "What happens…" to next frame | 148 to 194 ms |
| Press "Compare…" to next frame | 249 to 349 ms |

The same run checked the whole journey on the live site: the failure, the comparison, start again, fresh visits to both shared links and `?full`, with no console errors and no sideways scrolling on the phone.

The goal that a first-time visitor understands the architecture, the failure and the trade-off within 60 seconds has not been tested with people; these checks show only that the journey works and is fast.
