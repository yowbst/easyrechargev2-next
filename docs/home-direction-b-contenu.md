# Accueil Direction B — contenu à charger dans Directus

Brouillon à relire. Rien n'est écrit dans le CMS tant que tu n'as pas validé.

Destination : `pages` → page `home` → `translations[].content`, objet JSON imbriqué.
La clé `pages.home.blocks.product.title` correspond à `content.blocks.product.title`.

**⚠️ = affirmation non vérifiée.** Je l'ai écrite parce qu'elle vient du design,
mais elle sort de ce que tu as confirmé. À valider ou à couper.

**L'allemand ci-dessous est une traduction de travail.** Le sens est fidèle, mais
le registre marketing mérite une relecture par un germanophone avant publication.

---

## 1 · Hero — 5 chaînes

| Clé | FR | DE |
|---|---|---|
| `blocks.hero.badge` | installations en Suisse romande | Installationen in der Westschweiz |
| `blocks.hero.stats.first_contact` | Premier contact | Erster Kontakt |
| `blocks.hero.stats.quote_delivery` | Devis chiffré en main | Detailliertes Angebot |
| `blocks.hero.stats.rating` | Note Trustpilot | Trustpilot-Bewertung |
| `blocks.mini-quote.reassurance` | Sans engagement · Aucune carte bancaire | Unverbindlich · Keine Kreditkarte |

Les chiffres (550, 48, 3–5, 4.8) viennent de `global_config` — rien à saisir.

> « Premier contact **garanti** » du design est devenu « Premier contact » : tu as
> demandé qu'on annonce le délai, pas qu'on le garantisse.
> « Données hébergées en Suisse » est supprimé de la ligne de réassurance.

---

## 2 · La borne — 11 chaînes

| Clé | FR | DE |
|---|---|---|
| `blocks.product.eyebrow` | LA BORNE | DIE LADESTATION |
| `blocks.product.title` | Une borne murale, un câble, une place de parc. | Eine Wandladestation, ein Kabel, ein Parkplatz. |
| `blocks.product.lede` | Pas de génie civil, pas d'abonnement. Une prise Type 2 aux normes suisses, posée sur le mur de votre garage et raccordée à votre tableau électrique existant. | Keine Tiefbauarbeiten, kein Abonnement. Ein Typ-2-Anschluss nach Schweizer Norm, an der Wand Ihrer Garage montiert und an Ihre bestehende Elektroverteilung angeschlossen. |
| `blocks.product.cta.label` | Voir les bornes | Ladestationen ansehen |
| `blocks.product.badge` | Contrôle OIBT réalisé à la mise en service | NIV-Kontrolle bei der Inbetriebnahme |
| `blocks.product.image_alt` | Borne de recharge murale installée dans un garage privé | Wandladestation in einer privaten Garage installiert |

### Annotations sur la photo

| # | FR titre | FR corps | DE titre | DE corps |
|---|---|---|---|---|
| 0 | 11 kW | ⚠️ Puissance la plus courante en maison individuelle, sur raccordement triphasé. | 11 kW | Die gängigste Leistung im Einfamilienhaus, bei Dreiphasenanschluss. |
| 1 | Prise Type 2 | Standard européen : compatible avec les voitures électriques vendues en Suisse. | Typ-2-Anschluss | Europäischer Standard: kompatibel mit den in der Schweiz verkauften Elektroautos. |
| 2 | ⚠️ Câble attaché | Vous branchez, c'est tout. Rien à sortir du coffre, rien à ranger. | Fest angeschlossenes Kabel | Einstecken, fertig. Nichts aus dem Kofferraum holen, nichts verstauen. |

> **Le badge OIBT** ne dit plus « contrôle annuel inclus ». Il dit ce que tu m'as
> confirmé : le contrôle est fait à la mise en service.
> **« compatible avec toutes les voitures »** est devenu « avec les voitures » —
> un absolu qu'on ne peut pas tenir sur un parc entier.
> **Les deux ⚠️** sont des specs produit que je ne peux pas vérifier : la puissance
> la plus courante chez tes clients, et le fait que la borne ait un câble attaché
> (c'est une option sur la plupart des modèles). Corrige ou coupe la carte.

---

## 3 · Quelle puissance — 18 chaînes

| Clé | FR | DE |
|---|---|---|
| `blocks.power.title` | Quelle puissance pour votre voiture ? | Welche Leistung für Ihr Auto? |
| `blocks.power.aside` | Pour une batterie de 60 kWh | Für eine 60-kWh-Batterie |
| `blocks.power.note` | L'installateur confirme la puissance réellement disponible après lecture de votre tableau électrique — c'est inclus dans le devis. | Der Installateur bestätigt die tatsächlich verfügbare Leistung nach Prüfung Ihrer Elektroverteilung — im Angebot inbegriffen. |

| # | kw | tag FR / DE | titre FR / DE | corps FR / DE | temps FR / DE |
|---|---|---|---|---|---|
| 0 | 3.7 kW | Dépannage / Notlösung | Prise renforcée / Verstärkte Steckdose | Une prise domestique sécurisée. Suffisant pour un hybride rechargeable ou de courts trajets quotidiens. / Eine gesicherte Haushaltssteckdose. Ausreichend für einen Plug-in-Hybrid oder kurze Alltagsstrecken. | ≈ 16 h si votre véhicule accepte 3,7 kW / ≈ 16 Std., wenn Ihr Fahrzeug 3,7 kW annimmt |
| 1 | 11 kW | **Recommandé** / **Empfohlen** | Borne triphasée / Dreiphasige Ladestation | Le bon compromis pour une maison. Votre batterie est pleine chaque matin, sans y penser. / Der richtige Kompromiss für ein Haus. Ihre Batterie ist jeden Morgen voll, ohne dass Sie daran denken müssen. | ≈ 5 h 30 si votre véhicule accepte 11 kW / ≈ 5 Std. 30, wenn Ihr Fahrzeug 11 kW annimmt |
| 2 | 22 kW | Gros rouleurs / Vielfahrer | Borne haute puissance / Hochleistungs-Ladestation | Utile si votre véhicule l'accepte et que vous enchaînez les longs trajets dans la journée. / Sinnvoll, wenn Ihr Fahrzeug dies zulässt und Sie tagsüber lange Strecken aneinanderreihen. | ≈ 2 h 45 si votre véhicule accepte 22 kW / ≈ 2 Std. 45, wenn Ihr Fahrzeug 22 kW annimmt |

> `recommended` = `"true"` sur la ligne 1 uniquement.
>
> **Le recadrage des temps.** L'arithmétique est juste côté borne (60 ÷ 11 ≈ 5,5)
> mais le chargeur embarqué plafonne : beaucoup de modèles sont limités à 11 kW,
> certains à 7,4, peu acceptent 22. La condition est donc passée du bas de bloc
> dans la ligne elle-même. L'info reste utile, la promesse disparaît.

---

## 4 · Badge SLA du process — 1 chaîne

| Clé | FR | DE |
|---|---|---|
| `process.steps.installation.sla` | DATE FIXÉE | FIXER TERMIN |

Les trois autres badges (`3 MIN`, `SOUS 48 H`, `3–5 JOURS`) sont dérivés de
`global_config.slas` — ils ne peuvent pas diverger du reste de la page.
Aucune mention de réattribution : tu as demandé qu'on annonce le délai, point.

---

## 5 · Copropriétés / PPE — BLOQUÉ

Rédigé, pas validé. Le design affirme que tes partenaires livrent l'étude de
puissance, le plan de recharge collective et le chiffrage par lot « au format que
votre régie attend ». Avec un seul partenaire actif, je ne sais pas si ça décrit
une prestation réelle. **Réponds là-dessus et je complète cette section.**

---

## 6 · Le réseau — ABANDONNÉ

Un seul partenaire. Section masquée, aucune clé à créer.

---

## 7 · Témoignages — EN ATTENTE DE TA DÉCISION

Pas de contenu généré. Quatre options, par ordre de valeur :
extraire tes vrais avis Trustpilot · solliciter des clients installés ·
remplacer par de la preuve factuelle (550 installations, cantons couverts) ·
masquer la section comme Le réseau.

---

## Encore ouvert

1. PPE — prestation réelle ? (section 5)
2. Les deux ⚠️ de « La borne » (section 2)
3. PPE « 12 places · Chêne-Bougeries » — cas réel ou libellé générique ?
4. Témoignages — laquelle des quatre options ?
5. Numéro IDE, quand tu l'auras
