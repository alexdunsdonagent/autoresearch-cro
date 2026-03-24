# Product Spec: AI-Driven A/B Testing for selfcatering.co.uk

## The Business

selfcatering.co.uk is a holiday cottage affiliate site. Visitors land on property pages, browse, and click through to booking providers (Sykes, Cottages.com, etc). Every clickout has a chance of becoming a booking and earning commission.

**Current numbers:**
- 509K total visitors, 186K clickouts
- Organic clickout rate: 64% (target: 68%)
- Paid clickout rate: 36.6%
- £170K commission in 2025, £50K YTD 2026
- £8K/month Google Ads spend, true paid ROAS ~1.1x (roughly breakeven)
- 42K+ individual property pages

## The Opportunity

Moving clickout rate from 64% to 68% on organic traffic = ~12,000 extra clickouts/year. At current EPC (£0.43/visitor), that's roughly £5,000 extra commission annually.

The bigger prize is paid traffic. A 5 percentage point lift on paid clickouts moves ROAS from ~1.1x to potentially 1.5x+, unlocking the ability to scale ad spend profitably.

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  1. GENERATE (overnight, Mac Mini)                          │
│                                                             │
│  generate.mjs calls Claude API with property data           │
│  → 15 radical page variants per diversity strategy          │
│  → Scored locally (Puppeteer + Qwen 8B judge)              │
│  → Top 5 kept in variants/                                  │
│  → Cost: ~$0.75 per batch                                   │
├─────────────────────────────────────────────────────────────┤
│  2. DEPLOY (Richard, one-time setup + variant drops)        │
│                                                             │
│  nginx rule: if ?tpl=variant-a → serve variant template     │
│  SC Studio: add "variant" field to session tracking         │
│  Variant HTML files dropped into Laravel template dir       │
├─────────────────────────────────────────────────────────────┤
│  3. DRIVE TRAFFIC (Google Ads, existing campaigns)          │
│                                                             │
│  Tracking template: {lpurl}?tpl={_variant}                  │
│  Campaign experiments or ad variations split traffic        │
│  50/50 control vs variant-a (or 20% each across 5)         │
│  Organic: nginx assigns variant via cookie (later)          │
├─────────────────────────────────────────────────────────────┤
│  4. MEASURE (measure.mjs reads SC Studio data)              │
│                                                             │
│  SC Studio tracks: session → pages → clickout + variant     │
│  measure.mjs: chi-squared test per variant vs control       │
│  Declare winner at p < 0.05 with 100+ views per variant    │
├─────────────────────────────────────────────────────────────┤
│  5. PROMOTE & REPEAT                                        │
│                                                             │
│  Winner becomes default template                            │
│  Generate new variants from the winner                      │
│  Continuous improvement cycle                               │
└─────────────────────────────────────────────────────────────┘
```

## Step-by-Step Workflow Plan

### Phase 0: Preparation (Day 1)

- [ ] **0.1** Pick one high-traffic property to test first
  - Use Google Ads spend data to find a property with 1,000+ clicks/month
  - Good candidates: Cumbria properties (£804/month spend, 1,687 clicks)
  - Note the 4-letter property code (e.g. `kmtr`)

- [ ] **0.2** Get the current property page HTML
  - Visit `selfcatering.co.uk/england/cumbria/{town}/{code}/`
  - Save the rendered HTML as `template.html` in autoresearch-cro
  - This becomes the control variant

- [ ] **0.3** Pull property data from the Property API
  - `GET https://api.selfcatering.co.uk/api/v1/search?code={code}`
  - Save the property details (name, bedrooms, price, location, providers, affiliate links)
  - This data feeds into variant generation

### Phase 1: Generate Variants (Day 1-2)

- [ ] **1.1** Add Claude API support to `generate.mjs`
  - Install `@anthropic-ai/sdk`
  - Add `--provider claude` flag alongside existing Ollama support
  - Set `ANTHROPIC_API_KEY` env var

- [ ] **1.2** Update `program-generate.md` with real property data
  - Replace the hardcoded Meadow View example with actual property details
  - Include real affiliate links, real pricing, real feature list
  - Keep all 15 diversity strategies

- [ ] **1.3** Generate variants
  ```bash
  ANTHROPIC_API_KEY=sk-... node generate.mjs --count 15 --top 5 --provider claude
  ```
  - Review the 5 winners in `variants/`
  - Open each in a browser to sanity-check
  - Verify affiliate links are correct and `data-clickout="true"` is present
  - Cost: ~$0.75

- [ ] **1.4** Manual QA of variants
  - Check mobile rendering (375px viewport)
  - Verify clickout links go to the right booking provider
  - Confirm property data is accurate (price, bedrooms, location)
  - Delete any variant that looks broken

### Phase 2: Richard's Setup (Day 2-3)

- [ ] **2.1** Brief Richard on the plan
  - Explain: we want to serve different HTML templates for the same property
  - We'll pass `?tpl=variant-a` in the URL from Google Ads
  - SC Studio needs to record which variant the visitor saw

- [ ] **2.2** Richard adds nginx variant routing
  - When `?tpl=` parameter is present, serve the variant template
  - When absent, serve the default (control)
  - Variant files live in a `variants/{code}/` directory on the server

- [ ] **2.3** Richard adds variant field to SC Studio
  - Read `?tpl=` from the request URL
  - Store it on the session object alongside UTMs
  - Include variant in clickout event logging
  - No changes needed to commission match-back (that's downstream)

- [ ] **2.4** Deploy variant HTML files to the server
  - Upload the 5 variant files + 1 control to `variants/{code}/`
  - Test: visit `selfcatering.co.uk/england/cumbria/{town}/{code}/?tpl=variant-a`
  - Verify: correct variant renders, SC Studio logs the variant field

### Phase 3: Configure Google Ads (Day 3)

- [ ] **3.1** Set up tracking template for the test property
  - Find the property's Google Ads campaign
  - Campaign naming convention: `G - 10 - SK - D - P - EN - {County} - {Town} - {Name} - {code}`
  - Add custom parameter `{_variant}` at campaign or ad group level

- [ ] **3.2** Create ad variations for traffic splitting
  - Option A: Google Ads Campaign Experiments (50/50 split)
    - Control: `?tpl=control`
    - Test: `?tpl=variant-a`
  - Option B: Multiple ad variations with different final URLs
    - Ad 1: landing page URL + `?tpl=control`
    - Ad 2: landing page URL + `?tpl=variant-a`
    - Set rotation to "Rotate evenly"

- [ ] **3.3** Verify tracking end-to-end
  - Click the ad (or preview it)
  - Check SC Studio: does the session have the variant field?
  - Click through to the booking provider
  - Check SC Studio: does the clickout event include the variant?
  - Confirm the `gclid` / `hash` parameter is still passing correctly

### Phase 4: Run the Test (Day 3-10)

- [ ] **4.1** Let it run for 7 days minimum
  - Don't touch the ads or variants during the test
  - Check SC Studio daily to verify data is flowing
  - Expected: ~240 clicks/day for a 1,687 clicks/month property
  - ~120 per variant per day = ~840 per variant over 7 days

- [ ] **4.2** Monitor for issues
  - Check SC Studio for unusual drop-offs
  - Verify clickout rates aren't drastically worse (kill switch: if variant drops below 25% clickout rate, pause it)
  - Check Google Ads for any CPC changes (variant shouldn't affect ad performance)

### Phase 5: Measure Results (Day 10)

- [ ] **5.1** Pull data from SC Studio
  - Use MCP tool: `scstudio_clickouts` filtered by variant field
  - Or export from SC Studio dashboard
  - Need: pageviews and clickouts per variant

- [ ] **5.2** Run significance test
  ```bash
  node measure.mjs --min-views 100
  ```
  - Repoint `measure.mjs` to read SC Studio data (or import it)
  - Chi-squared test: is the difference statistically significant at p < 0.05?

- [ ] **5.3** Generate report
  ```bash
  node report.mjs
  ```
  - Full results table: variant, views, clicks, rate, vs control, significance
  - LLM judge scores vs actual performance (calibration check)

- [ ] **5.4** Decision
  - **Winner found (p < 0.05, higher clickout rate):** proceed to Phase 6
  - **No significant difference:** generate new, more radical variants. Return to Phase 1
  - **Variant performed worse:** revert to control, learn from what didn't work

### Phase 6: Promote and Scale (Day 10+)

- [ ] **6.1** Promote the winner
  - Winner becomes the default template for that property
  - Richard swaps it in as the main template
  - Remove the `?tpl=` split — all traffic sees the winner

- [ ] **6.2** Scale to top 20 properties
  - Identify 20 highest-traffic properties from `gads-6mo.json`
  - Generate 3 variants each (60 total, ~$3 API cost)
  - Deploy, split traffic, measure over 14 days

- [ ] **6.3** Automate the loop
  - Nightly cron: `node generate.mjs` for properties that need new variants
  - Weekly: `node measure.mjs` to check for winners
  - Auto-promote when significance reached
  - Generate new variants from winners — continuous improvement

### Phase 7: Expand to Organic Traffic (Month 2+)

- [ ] **7.1** Cookie-based variant assignment for organic visitors
  - nginx sets a cookie on first visit: `ab_variant=control` or `ab_variant=variant-a`
  - Returning visitors always see the same variant
  - SC Studio reads the cookie value into the session

- [ ] **7.2** Test across organic and paid simultaneously
  - Same variants, same measurement
  - Can compare: does the same variant win on both traffic sources?

- [ ] **7.3** Systematic rollout across all high-traffic properties
  - Any property with 500+ visits/month gets A/B tested
  - Continuous variant generation and testing
  - Monthly report on cumulative clickout rate improvement

## What Exists vs What's Needed

| Component | Today | Needed | Who | Effort |
|-----------|-------|--------|-----|--------|
| Property pages | 42K+ static in Laravel | Variant routing via `?tpl=` | Richard | 2-4 hours |
| Clickout tracking | SC Studio, full pipeline | Add variant field to session | Richard | 1-2 hours |
| Google Ads | 274 campaigns, £8K/mo | Add `?tpl=` tracking template | Alex | 30 mins |
| Variant generation | `generate.mjs` (Qwen 8B) | Swap to Claude API | Alex | 1 hour |
| Synthetic scoring | `score.mjs` working | Keep as pre-filter | Done | — |
| Significance testing | `measure.mjs` (JSONL) | Repoint to SC Studio data | Alex | 1 hour |
| Report generation | `report.mjs` working | Add SC Studio data section | Alex | 30 mins |

## Cost Estimate

| Item | Cost | Notes |
|------|------|-------|
| Claude API (generation) | ~$3 per batch of 60 | One-time per property set |
| Google Ads (existing) | £8K/month | Already spending this |
| Richard's time | 3-6 hours one-time | nginx + SC Studio changes |
| Alex's code changes | 3-4 hours one-time | Claude API + SC Studio integration |
| Ongoing | ~$10/month API | Regenerating variants for winners |

## Success Metrics

| Metric | Current | Phase 1 Target | Phase 3 Target |
|--------|---------|---------------|---------------|
| Organic clickout rate | 64% | 66% (1 property) | 68% (top 20) |
| Paid clickout rate | 36.6% | 40% (1 property) | 42% (top 20) |
| Properties A/B tested | 0 | 1 | 20+ |
| True paid ROAS | ~1.1x | 1.2x | 1.5x+ |

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Richard doesn't have bandwidth | Medium | Blocks everything | Keep scope tiny — 10 lines nginx, 5 lines SC Studio |
| AI variants convert worse than originals | Medium | Low (we revert) | Kill switch at 25% clickout rate. Start with 1 property |
| Variant breaks affiliate links | Low | High (lost commission) | QA every variant manually. Verify `data-clickout` + correct URLs |
| Google Ads penalises variant pages | Very low | Medium | Variants have same content, just different layout. No cloaking |
| SC Studio can't track variant field | Low | Medium | Fallback: JSONL tracking on standalone server |

## Overall Recommendation

**Start with Phase 0-1 this week (no dependency on Richard).** Generate variants for a real property using Claude API and score them locally. This proves variant quality before involving anyone else.

Then brief Richard on Phase 2 — the ask is small (10 lines nginx, 5 lines SC Studio). Frame it as: "I have 5 page designs ready to test. Can you add a URL parameter that switches which template loads? And tag it in SC Studio?"

The critical path is: **pick a property → generate variants → get Richard's 3-hour setup → run the test.** Everything else is measurement and iteration that we've already built.
