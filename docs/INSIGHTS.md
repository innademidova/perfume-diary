# Insights about her taste and the data

## Taste (from her reviews; the live version is in `taste_profile`)

- Loves: warm "boozy" scents with cognac/brandy and a little spice for cold weather (Angels' Share On The Rocks 4★,
  Apple Brandy on the Rocks 3.5★); soft woody vanilla whose sweetness fades (Ambre Latte 4★); juicy pear (Pear Inc.),
  compote-like cherry (Lost Cherry, Red Enigma); soft Good Girl flankers (Good Girl Blush 3.5★). Palatine 3.5★ despite
  violet — nostalgic.
- Dislikes: **powderiness** (iris, violet, heliotrope, rose → "old lipstick"), heavy rose, magnolia, lychee, passion
  fruit, citrus ("chemical"), lots of jasmine (acetone opening), oud/myrrh/saffron/vetiver ("Soviet cologne"),
  pronounced spices (cardamom, clove, nutmeg), very masculine woods.
- Key pattern: **sweet perfumes please at first, then bore her or cause nausea after a few days** — 3 ml is often enough.
- Warm scents = autumn/winter for her. Weak longevity/sillage and high price lower the rating.
- Brands: Lattafa "all the same"; Juliette Has A Gun and Kilian mixed; Good Girl line "no bad ones".

## Data findings

- Leave-one-out test on 49 rated perfumes: note-based prediction (kNN on IDF-weighted notes + per-note Bayesian
  averages, several settings tried) had mean error ~0.81★ vs 0.79★ for "always predict her mean". **Notes alone
  don't predict her ratings** (Lost Cherry 3.5★ vs Cherry Cherry 1★; Ambre Latte 4★ vs Eclaire Pistache 1.5★).
  What matters is in the review text (powdery, cloying, gets boring) → forecasts are done by an LLM with full reviews.
- Her mean rating is low (~2.2★ on 0–5): most decants disappoint, so a 3★ is already "good".
- Per-note averages with ≥3 occurrences: sandalwood and rum above average; oud, saffron, raspberry, strawberry,
  patchouli, amber, ginger, nutmeg below.
- Fragrantica pages often list notes inconsistently between versions; flankers are the main source of mistakes.
