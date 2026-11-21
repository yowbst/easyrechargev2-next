# Dataset profile: Swiss electrical installer candidates

Generated 2026-11-21 from the register fetch of 2026-11-20 (LINDAS, graph updated 2026-11-19) and the plan `2026-11-21-180022`. Nothing is in Directus yet. 4,798 rows, 26 cantons.

## Summary

- **Structure is clean.** Every row has a UID that passes the Swiss check-digit test, a name, a purpose and a canton. No duplicate UIDs, register ids or name-plus-postcode pairs.
- **Classification is the weak point.** The model scores about 90% on a hand-labelled set (86% to 90% across runs). Treat the 3,404 published rows as roughly 90% precise.
- **The register has no contacts and no legal status.** Website, phone, e-mail and the person running each company are all empty. Liquidation is detected from the name only.
- **3,637 installers, 3,404 published.** 2,381 (69.9%) of the published rows are in cantons without an active partner, which is the prospect list.

## Completeness

| Field | Filled |
|---|---|
| uid | 4,798 (100.0%) |
| chid | 4,798 (100.0%) |
| legal_name | 4,798 (100.0%) |
| purpose_text | 4,798 (100.0%) |
| legal_form_code | 4,798 (100.0%) |
| street_address | 4,768 (99.4%) |
| postal_code | 4,787 (99.8%) |
| locality | 4,798 (100.0%) |
| canton | 4,798 (100.0%) |
| bfs_id | 4,798 (100.0%) |
| lat | 4,764 (99.3%) |
| lng | 4,764 (99.3%) |

Missing coordinates (34) and missing postcodes (11) are special postcodes such as PO box codes. Missing streets (30) are register entries with no street.

## Validity

- UID format and check digit: 4,798 (100.0%)
- Postcode is four digits: 0 (0.0%)
- Coordinates inside Switzerland's bounding box: 4,764 (99.3%)
- Register canton agrees with the postcode's canton: 4,764 (99.3%)

## Duplicates and shared data

- Duplicate UID: 0. Duplicate register id: 0. Duplicate name and postcode: 0.
- 240 addresses are shared by two or more companies, covering 508 rows. The most on one address is 5.
- 0 rows (0.0%) have a care-of address, so the address may not be where the work is done. That matters for any "nearby" ranking.
- 4768 streets have no house number.
- 142 rows share a purpose text with another row (4,656 distinct purposes).

## Shape

- Legal form: llc 2,200, corporation 1,610, sp 919, gp 27, branch 23, other 11, cooperative 8.
- Purpose language (heuristic): German 3,027 (63.1%), French 1,317 (27.4%), Italian 454 (9.5%).
- Purpose length: median 556 characters, 90th percentile 1053. 3,594 (74.9%) are longer than the 230-character excerpt budget, which is why the excerpt now includes the passage around the first electrical wording.
- In liquidation or bankruptcy (by name): 278. None of them is published.

## Geography

| Canton | Rows | Installers | Published | Partner coverage |
|---|---|---|---|---|
| ZH | 736 | 534 | 489 |  |
| VD | 537 | 410 | 398 | served |
| TI | 435 | 366 | 329 |  |
| BE | 401 | 312 | 295 |  |
| AG | 348 | 255 | 241 |  |
| GE | 312 | 259 | 238 | served |
| VS | 260 | 212 | 194 | served |
| SG | 246 | 179 | 172 |  |
| LU | 219 | 175 | 174 |  |
| FR | 190 | 147 | 132 | served |
| TG | 142 | 103 | 101 |  |
| GR | 139 | 105 | 93 |  |
| SO | 134 | 95 | 91 |  |
| BL | 127 | 85 | 81 |  |
| ZG | 120 | 68 | 59 |  |
| SZ | 96 | 75 | 72 |  |
| NE | 95 | 61 | 61 | served |
| BS | 52 | 39 | 34 |  |
| AR | 42 | 33 | 30 |  |
| JU | 41 | 30 | 27 |  |
| NW | 34 | 24 | 23 |  |
| SH | 30 | 20 | 20 |  |
| GL | 22 | 17 | 17 |  |
| OW | 18 | 13 | 13 |  |
| AI | 11 | 9 | 9 |  |
| UR | 11 | 11 | 11 |  |

Served cantons (VD, VS, FR, GE, NE): 1,394 rows, 1,023 published. All other cantons: 2,381 published rows.

## Classification

| Label | Rows |
|---|---|
| installer | 3,637 |
| other | 524 |
| inspector | 322 |
| planner | 311 |
| solar | 4 |

- Status: published 3,404, draft 1,394. Publish rule: installer, confidence at least 0.8, not in liquidation.
- Confidence bands: 0.7: 19, 0.8: 323, 0.9: 1,696, 1.0: 2,760.
- Installer share by legal form: sp 702/919, llc 1,705/2,200, corporation 1,186/1,610, gp 22/27, branch 16/23.
- **Prompt change (v2):** the excerpt now includes the passage around the first electrical wording, and the prompt counts multi-trade firms as installers. 766 of 4,798 labels changed versus the first pass, mostly "other" to "installer" (446). Most of those hold up: 517 of the 584 newly labelled installers carry explicit electrical-installation wording.

### Known weak spots

- **340 of 3,637 installers (9.3%) have no explicit installation wording** in their purpose (for example "elektrotechnische Beratungen" or "Gebäudetechnik"). Some are real, some are not.
- **282 installers also list real-estate, general-contracting or energy-supply activities.** This is a loose flag, not a defect count: in a sample of six, four are plausible electrical contractors with other trades (for example One Electro SA, Andy's Allrounder GmbH) and two are doubtful (Solvex Solutions GmbH is a real-estate adviser, O.G.E. Ott General Engineering AG is a general engineering firm). Plan on a manual review of this group before publishing. Examples:

- **O.G.E. Ott General Engineering AG** (ZG, confidence 0.9): Planung, Konstruktion, technische Berechnung, Herstellung und betriebsfertige Ausführung als Generalunternehmerin von Industrie-, Sport-, Gewerbe-, Ha
- **One Electro SA** (VD, confidence 0.9): la société a pour but toutes activités dans le domaine de l'électricité, des télécommunications, de l'informatique et des énergies ainsi que l'import 
- **Solvex Solutions GmbH** (SG, confidence 0.8): Beratung und Unterstützung in den Bereichen Immobilieninvestitionen, Kauf, Verkauf, Finanzierung und Verwaltung. Vermittlung von Immobilien und Analys
- **TEC-PROS Sàrl** (GE, confidence 0.99): tous travaux de construction et de rénovation, notamment revêtements de sol, faux-planchers, isolation, peinture et tous travaux d'électricité. La soc
- **Andy's Allrounder GmbH** (LU, confidence 0.98): Planung und Installation von Elektroanlagen; Ausführung von Elektroarbeiten; Erbringung von Dienstleistungen aller Art im Baubereich; Handel mit Waren
- **Rechsteiner Handels AG** (AG, confidence 0.92): Verwaltung von Liegenschaften und deren Unterhalt, Handel mit Waren aller Art, Projektierung und Erstellung von elektrotechnischen Anlagen sowie EDV-I

- **Over-labelling.** On the golden set the false positives are typically cleaning, medical and IT firms that mention electricity once. Missing a real installer is the less common error (2 to 3 of 59 in the golden set).
- **Run-to-run noise.** The same prompt scored 88.9% and 90.0% on consecutive runs. This is the noise floor of the cheap model, not a bug.

## ESTI

Not collected. The ESTI permit register would add permit number, type, validity and the responsible person, and would settle the doubtful rows above. Bright Data refuses the ESTI hosts under its Government policy, so a lookup needs your own IP or an extract requested from info@esti.admin.ch. The ESTI fields exist in Directus and are empty.

## Recommended before showing anything publicly

1. Review the published set per canton for the suspect rows above, or tighten the rule so electrical work must be the main activity.
2. Add ESTI permit data (extract or slow lookups) to confirm installers.
3. Keep `do_not_display` and `classification_override` for hand corrections. The next plan keeps them.
4. Consider a second model pass or a stronger model only for rows with confidence under 0.95, where most errors sit.
