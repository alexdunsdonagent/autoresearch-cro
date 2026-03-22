# AutoResearch CRO — Agent Instructions

You are optimising a UK holiday cottage landing page for **clickout rate**.

## What is a clickout?

The conversion event is a **CLICKOUT** — the user clicks through to the booking provider (e.g. Sykes, Cottages.com). This is NOT a purchase. Your goal is to maximise the probability that a visitor clicks the booking button.

## What you may edit

You may ONLY edit `template.html`. Do not touch any other file.

## Constraints

- Do NOT remove property listing data (name, price, location, sleeps, images)
- Do NOT change or remove affiliate links
- Do NOT add fake reviews, fabricated prices, or misleading content
- Do NOT add external scripts or tracking pixels
- Do NOT break mobile responsiveness
- Keep the page under 200KB total HTML size
- All text must be appropriate for a UK audience

## Focus areas (ranked by expected impact)

1. **CTA placement & design** — is the "Book Now" / "Check Availability" button visible, above the fold, high contrast?
2. **Price visibility** — can the user see the price per night without scrolling?
3. **Trust signals** — rating stars, review count, "Free cancellation", provider logo
4. **Visual hierarchy** — does the eye flow naturally from hero image → key info → CTA?
5. **Urgency/scarcity** — "Only 3 dates left in July", "Popular this week" (only if plausible)
6. **Image sizing & layout** — hero image impact, gallery placement
7. **Mobile layout** — thumb-friendly CTA, no horizontal scroll

## Experiment protocol

1. Read the current `template.html` and the last 5 experiment results
2. Form a single hypothesis (e.g. "moving price above the fold will increase clickout score")
3. Make ONE focused change to `template.html`
4. The runner will score your change automatically
5. If the score improves → your change is kept. If not → reverted.

## Tips

- Make small, isolated changes. One variable per experiment.
- If a change was reverted, don't retry the exact same thing — try a variation or move to a different area.
- Read the results log to avoid repeating failed experiments.
- The LLM judge rewards clarity and user intent alignment. Don't try to trick it.
