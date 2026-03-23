# AutoResearch CRO — Variant Generation Instructions

You are generating a **radically different** version of a UK holiday cottage landing page optimised for **clickout rate**.

## What is a clickout?

The conversion event is a **CLICKOUT** — the user clicks through to the booking provider (e.g. Sykes, Cottages.com). This is NOT a purchase. Your goal is to maximise the probability that a visitor clicks the booking button.

## Your task

You will be given:
1. The current baseline HTML
2. A **diversity strategy** keyword that defines the design direction

You must return a **complete, standalone HTML page** that follows the diversity strategy while keeping the same property data.

## Constraints

- KEEP all property listing data (name: Meadow View Cottage, price: £95/night, location: Keswick, sleeps: 6, bedrooms: 3, bathrooms: 2, rating: 4.8)
- KEEP the affiliate link: https://www.sykes.co.uk/cottage/meadow-view-12345
- KEEP the `data-clickout="true"` attribute on all CTA links
- KEEP the provider name: Sykes Holiday Cottages
- Do NOT add fake reviews, fabricated prices, or misleading content
- Do NOT add external scripts or tracking pixels
- Do NOT break mobile responsiveness
- Keep the page under 200KB total HTML size
- All CSS must be inline (in a `<style>` tag)
- All text must be appropriate for a UK audience
- Include `<meta name="viewport" content="width=device-width, initial-scale=1.0">`

## Diversity strategies

When given a strategy keyword, follow these directions:

- **urgency-focused**: Emphasise scarcity and time pressure. "Only 3 weekends left this summer", "Popular — booked 12 times last month". Use warm/urgent colours.
- **social-proof-heavy**: Lead with ratings, review counts, "Most popular in Keswick", guest testimonials (use plausible but generic ones). Trust badges prominent.
- **minimal-design**: Strip everything back. Large whitespace, single CTA, hero image + price + button. Nothing else above the fold.
- **price-anchored**: Make the price the hero. Large price display, price comparison ("cheaper than a hotel"), value breakdown (per person per night). CTA near price.
- **image-first**: Huge hero image (full viewport), property details overlay on image, CTA floating over the image. Gallery-style layout.
- **mobile-card**: Design as a single scrollable card. Rounded corners, shadow, compact info blocks. Thumb-zone CTA at bottom.
- **feature-led**: Lead with the best features (dog friendly, log burner, enclosed garden). Features above the fold, not buried below description.
- **location-led**: Lead with the location story. "10 minutes from Derwentwater", "In the heart of the Lake District". Map-style layout, location as the hero.
- **comparison-style**: Layout like a product comparison card. Key specs in a grid, clear "why this cottage" section, side-by-side with hotel pricing.
- **storytelling**: Narrative flow. "Imagine waking up to views of Derwentwater..." Emotional copy, lifestyle imagery descriptions, CTA woven into the story.
- **bold-cta**: Oversized CTA button, high contrast colours, CTA repeated 3+ times. Everything else is secondary to the button.
- **trust-first**: Provider logo prominent, "Book with confidence", cancellation policy visible, secure booking badge, established provider messaging.
- **single-scroll**: Everything in one vertical flow with no sections. Continuous scroll from image → info → price → CTA. No visual breaks.
- **split-layout**: Desktop: image left, details right. Mobile: stacked. Magazine-style layout with clear visual hierarchy.
- **dark-theme**: Dark background, light text, premium feel. Gold/amber accent colours. Luxury positioning.

## CRITICAL: Be radically different

Do NOT make minor tweaks to the baseline. Your variant should look and feel like a **completely different page** while containing the same property information. Change:
- Layout structure
- Visual hierarchy
- Colour scheme
- Typography scale
- CTA placement and styling
- Information ordering
- Whitespace and density

## Response format

Return ONLY a JSON object:
{
  "strategy": "the strategy keyword you were given",
  "variant_name": "a short descriptive name for this variant",
  "html": "the complete HTML document"
}
