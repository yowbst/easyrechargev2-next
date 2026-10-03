# Contenu Directus du funnel batterie (`pages.quote-battery`)

Textes du funnel de devis batterie solaire (`product = battery`), à charger dans Directus après validation. Copie relue, fr + de.

- **Allemand : traduction de travail, à faire relire par un locuteur natif avant la production** (même règle que `docs/home-direction-b-contenu.md`).
- **Slugs proposés :** `devis-batterie-solaire` (fr) / `offerte-solarbatterie` (de).
- **Rien n'est écrit dans Directus tant que Yoan n'a pas validé** les textes, les slugs et chaque payload.
- Les placeholders `{first_contact}` et `{quote_delivery_timeline}` sont conservés tels quels (interpolés depuis `global_config.slas`).
- Les clés pointées de la spécification sont données ici en objet imbriqué (`a.b.c` devient `{ "a": { "b": { "c": … } } }`).

## 1. Contenu de traduction `quote-battery`, fr-FR

```json
{
  "welcome": {
    "title": "Une batterie pour votre installation solaire",
    "subtitle": "Un installateur vous contacte sous {first_contact} h.",
    "stats": {
      "installations": {
        "label": "installations réalisées"
      },
      "rating": {
        "label": "note Trustpilot"
      }
    },
    "usps": {
      "certified": "Installateurs certifiés en Suisse romande",
      "fast": "Devis chiffré en {quote_delivery_timeline} jours",
      "transparent": "Sans engagement"
    },
    "cta": "Commencer"
  },
  "navigation": {
    "home": "Retour à l'accueil"
  },
  "common": {
    "dontKnow": "Je ne sais pas",
    "precisionHint": "Plus l'indication est précise, plus le calcul l'est."
  },
  "steps": {
    "housing": {
      "title": "Votre logement",
      "fields": {
        "housingStatus": {
          "label": "Vous êtes",
          "options": {
            "owner": "Propriétaire",
            "co-owner": "Copropriétaire",
            "tenant": "Locataire"
          }
        },
        "housingType": {
          "label": "Type de logement",
          "options": {
            "house": "Maison",
            "apartment": "Appartement"
          }
        },
        "solarEquipment": {
          "label": "Installation solaire",
          "options": {
            "exists": "En service",
            "in-progress": "En cours de pose",
            "none": "Pas encore"
          }
        }
      },
      "tenantExit": "Une batterie se décide avec le propriétaire du bâtiment. Parlez-lui de ce projet : il pourra faire sa demande ici.",
      "noPvNote": "Une batterie se dimensionne avec une installation solaire. Laissez-nous vos coordonnées : nous reviendrons vers vous pour un projet solaire avec batterie."
    },
    "pv": {
      "title": "Votre installation solaire",
      "fields": {
        "pvPower": {
          "label": "Puissance de l'installation",
          "tooltip": "Indiquée en kWc sur l'offre de votre installateur ou dans l'application de votre onduleur.",
          "showExact": "Je connais la puissance exacte",
          "hideExact": "Choisir une tranche"
        },
        "inverterBrand": {
          "label": "Marque de l'onduleur",
          "tooltip": "Le boîtier qui convertit le courant des panneaux. Sa marque figure dessus et dans l'application de suivi.",
          "options": {
            "solaredge": "SolarEdge",
            "fronius": "Fronius",
            "huawei": "Huawei",
            "sma": "SMA",
            "other": "Autre",
            "unknown": "Je ne sais pas"
          }
        },
        "existingBattery": {
          "label": "Batterie actuelle",
          "options": {
            "none": "Aucune",
            "extend": "Oui, à agrandir"
          }
        }
      }
    },
    "consumption": {
      "title": "Votre consommation",
      "fields": {
        "householdCount": {
          "label": "Ménages sur cette installation",
          "tooltip": "Plusieurs ménages partagent la même installation dans une PPE ou un regroupement de consommation propre."
        },
        "householdSize": {
          "label": "Personnes dans le ménage"
        },
        "annualConsumption": {
          "label": "Consommation annuelle",
          "showExact": "Je connais ma consommation annuelle",
          "hideExact": "Je ne la connais pas"
        },
        "heatPump": {
          "label": "Pompe à chaleur",
          "options": {
            "yes": "Oui",
            "no": "Non"
          }
        },
        "evCount": {
          "label": "Véhicules électriques rechargés sur cette installation"
        },
        "evPlanned": {
          "label": "Un véhicule électrique est-il prévu ?",
          "options": {
            "yes": "Oui",
            "no": "Non"
          }
        },
        "hasCharger": {
          "label": "Avez-vous déjà une borne de recharge ?",
          "options": {
            "yes": "Oui",
            "no": "Non"
          }
        },
        "deadline": {
          "label": "Quand souhaitez-vous installer la batterie ?",
          "options": {
            "asap": "Dès que possible",
            "2-3mo": "Dans 2 à 3 mois",
            "3-6mo": "Dans 3 à 6 mois",
            "6+mo": "Plus tard"
          }
        }
      }
    },
    "finalize": {
      "fields": {
        "approval": {
          "co-owner": {
            "label": "Avez-vous l'accord de la copropriété pour ce projet ?"
          }
        }
      }
    }
  }
}
```

## 2. Contenu de traduction `quote-battery`, de-DE

```json
{
  "welcome": {
    "title": "Ein Speicher für Ihre Solaranlage",
    "subtitle": "Ein Installateur meldet sich innert {first_contact} Std.",
    "stats": {
      "installations": {
        "label": "realisierte Installationen"
      },
      "rating": {
        "label": "Trustpilot-Bewertung"
      }
    },
    "usps": {
      "certified": "Zertifizierte Installateure",
      "fast": "Detailliertes Angebot in {quote_delivery_timeline} Tagen",
      "transparent": "Unverbindlich"
    },
    "cta": "Starten"
  },
  "navigation": {
    "home": "Zur Startseite"
  },
  "common": {
    "dontKnow": "Weiss ich nicht",
    "precisionHint": "Je genauer die Angabe, desto genauer die Berechnung."
  },
  "steps": {
    "housing": {
      "title": "Ihr Zuhause",
      "fields": {
        "housingStatus": {
          "label": "Sie sind",
          "options": {
            "owner": "Eigentümer",
            "co-owner": "Stockwerkeigentümer",
            "tenant": "Mieter"
          }
        },
        "housingType": {
          "label": "Wohnform",
          "options": {
            "house": "Haus",
            "apartment": "Wohnung"
          }
        },
        "solarEquipment": {
          "label": "Solaranlage",
          "options": {
            "exists": "In Betrieb",
            "in-progress": "Im Bau",
            "none": "Noch keine"
          }
        }
      },
      "tenantExit": "Ein Speicher wird mit dem Eigentümer entschieden. Sprechen Sie mit ihm: Er kann seine Anfrage hier stellen.",
      "noPvNote": "Ein Speicher wird zusammen mit einer Solaranlage geplant. Hinterlassen Sie Ihre Kontaktdaten: Wir melden uns für ein Solarprojekt mit Speicher."
    },
    "pv": {
      "title": "Ihre Solaranlage",
      "fields": {
        "pvPower": {
          "label": "Leistung der Anlage",
          "tooltip": "In kWp auf der Offerte Ihres Installateurs oder in der App Ihres Wechselrichters.",
          "showExact": "Ich kenne die genaue Leistung",
          "hideExact": "Bereich wählen"
        },
        "inverterBrand": {
          "label": "Marke des Wechselrichters",
          "tooltip": "Das Gerät, das den Strom der Module umwandelt. Die Marke steht darauf und in der Monitoring-App.",
          "options": {
            "solaredge": "SolarEdge",
            "fronius": "Fronius",
            "huawei": "Huawei",
            "sma": "SMA",
            "other": "Andere",
            "unknown": "Weiss ich nicht"
          }
        },
        "existingBattery": {
          "label": "Bestehender Speicher",
          "options": {
            "none": "Keiner",
            "extend": "Ja, zu erweitern"
          }
        }
      }
    },
    "consumption": {
      "title": "Ihr Verbrauch",
      "fields": {
        "householdCount": {
          "label": "Haushalte an dieser Anlage",
          "tooltip": "Mehrere Haushalte teilen sich eine Anlage im Stockwerkeigentum oder in einem ZEV."
        },
        "householdSize": {
          "label": "Personen im Haushalt"
        },
        "annualConsumption": {
          "label": "Jahresverbrauch",
          "showExact": "Ich kenne meinen Jahresverbrauch",
          "hideExact": "Ich kenne ihn nicht"
        },
        "heatPump": {
          "label": "Wärmepumpe",
          "options": {
            "yes": "Ja",
            "no": "Nein"
          }
        },
        "evCount": {
          "label": "Elektroautos, die an dieser Anlage laden"
        },
        "evPlanned": {
          "label": "Ist ein Elektroauto geplant?",
          "options": {
            "yes": "Ja",
            "no": "Nein"
          }
        },
        "hasCharger": {
          "label": "Haben Sie bereits eine Ladestation?",
          "options": {
            "yes": "Ja",
            "no": "Nein"
          }
        },
        "deadline": {
          "label": "Wann möchten Sie den Speicher installieren?",
          "options": {
            "asap": "So bald wie möglich",
            "2-3mo": "In 2–3 Monaten",
            "3-6mo": "In 3–6 Monaten",
            "6+mo": "Später"
          }
        }
      }
    },
    "finalize": {
      "fields": {
        "approval": {
          "co-owner": {
            "label": "Hat die Stockwerkeigentümergemeinschaft dem Projekt zugestimmt?"
          }
        }
      }
    }
  }
}
```

## 3. Clés du tableau de bord partenaire

À ajouter à la page qui porte déjà `category.owner_solar` et `score.factors.ownership` (envoyer le contenu de chaque traduction en entier : un PATCH sur un champ JSON remplace tout).

| Clé | fr | de |
|---|---|---|
| `category.owner_pv_small` | Propriétaire · PV < 10 kWc | Eigentümer · PV < 10 kWp |
| `category.owner_pv_large` | Propriétaire · PV ≥ 10 kWc | Eigentümer · PV ≥ 10 kWp |
| `category.co_owner_pv_small` | Copropriétaire · PV < 10 kWc | Stockwerkeigentümer · PV < 10 kWp |
| `category.co_owner_pv_large` | Copropriétaire · PV ≥ 10 kWc | Stockwerkeigentümer · PV ≥ 10 kWp |
| `category.no_pv` | Sans installation solaire | Ohne Solaranlage |
| `score.factors.pv_size` | Taille de l'installation | Anlagengrösse |
| `score.factors.load` | Véhicules et pompe à chaleur | Fahrzeuge und Wärmepumpe |

## 4. Vue de la demande (page `quote-view`, fr et de)

| Clé | fr | de |
|---|---|---|
| `sections.installation.title` | Installation solaire | Solaranlage |
| `sections.consumption.title` | Consommation | Verbrauch |

## 5. CTA des pages de succès

CTA de la page `quote-battery-success` (bloc `block_hero`, une CTA par langue), vers la borne :

```json
{
  "fr": {
    "label": "Une borne pour vos véhicules ?",
    "variant": "outline",
    "page_route_id": "quote",
    "show_when": {
      "any": [
        [
          {
            "field": "evCount",
            "gte": 1
          },
          {
            "field": "hasCharger",
            "in": [
              "no"
            ]
          }
        ],
        [
          {
            "field": "evPlanned",
            "in": [
              "yes"
            ]
          }
        ]
      ]
    }
  },
  "de": {
    "label": "Eine Ladestation für Ihre Fahrzeuge?",
    "variant": "outline",
    "page_route_id": "quote",
    "show_when": {
      "any": [
        [
          {
            "field": "evCount",
            "gte": 1
          },
          {
            "field": "hasCharger",
            "in": [
              "no"
            ]
          }
        ],
        [
          {
            "field": "evPlanned",
            "in": [
              "yes"
            ]
          }
        ]
      ]
    }
  }
}
```

CTA à ajouter à la fin du tableau `ctas` de chaque langue de la page `quote-success` (envoyer le tableau entier), vers la batterie :

```json
{
  "fr": {
    "label": "Combien pourriez-vous stocker ?",
    "variant": "outline",
    "page_route_id": "quote-battery",
    "show_when": [
      {
        "field": "solarEquipment",
        "in": [
          "exists",
          "in-progress"
        ]
      },
      {
        "field": "homeBattery",
        "in": [
          "none"
        ]
      }
    ]
  },
  "de": {
    "label": "Wie viel könnten Sie speichern?",
    "variant": "outline",
    "page_route_id": "quote-battery",
    "show_when": [
      {
        "field": "solarEquipment",
        "in": [
          "exists",
          "in-progress"
        ]
      },
      {
        "field": "homeBattery",
        "in": [
          "none"
        ]
      }
    ]
  }
}
```

## 6. Checklist pour Yoan

Chaque écriture Directus passe par le MCP easyrecharge et attend ton accord explicite sur le payload affiché. Les champs JSON sont toujours envoyés en entier.

- [ ] **Relire les textes et les slugs** (fr, et de par un locuteur natif), puis valider ce fichier.
- [x] **PORTE DE LANCEMENT — Make (fait le 2026-10-03).** Les leads sans PV ne passent jamais par l'envoi Ads (jamais dispatchés) et reçoivent leurs propres e-mails (fr/de/en). Les leads batterie dispatchés sont remontés sur l'action `7817425833` « BATTERY Quote Form Submitted (API) », la borne reste sur `7076158233`. Attio est isolé sur sa propre route.
- [x] **Créer les pages (Étape 4)** — fait le 2026-10-03, publiées en `noindex` pour les tests.
  - `quote-battery` : **`type = "app"`**, slugs ci-dessus, contenu des sections 1 et 2, `config = { "product": "battery", "steps": [] }`, bloc hero partagé avec `quote`.
  - `quote-battery-success` : **`type = "static"`**, `block_hero` avec le texte de succès de la borne et la CTA vers la borne (section 5).
  - Sans `type` `app` ou `static`, `fetchPageRegistry` ignore la page (404). Le registre est mis en cache 1 h : purger le Data Cache Vercel ou attendre.
- [ ] **Au lancement :** lever le `noindex` des deux pages ; sur `quote-success`, ajouter la CTA vers la batterie (section 5) au tableau `ctas` de chaque langue (pas avant : l'ancien code ignore `show_when` et l'afficherait à tous).
- [ ] **Traductions partenaires :** ajouter les clés de la section 3 (catégories, facteurs de score) et les titres de la section 4 à leurs pages.
- [x] **Prix partenaires (Étape 5)** — 60 CHF pour les 4 catégories, dans les 3 politiques « Standard ». L'éligibilité se règle dans `partner_products` (une ligne par installateur × produit, statut et quota) : E-ME reçoit la batterie en développement et staging ; **ligne batterie de production à créer au lancement**.
- [ ] **Google Ads (Étape 6).** Créer les actions de conversion batterie dans Google Ads, puis communiquer les labels ; ils seront écrits en `global_config.google_ads.conversions.battery = { "quote_start": { "label": "…" }, "quote_submit": { "label": "…" } }` (`global_config.google_ads` envoyé en entier). Tant qu'ils sont absents, les conversions restent inertes par conception.
- [ ] **Make (Étape 7, hors dépôt).**
  - Router l'e-mail partenaire sur `product = battery` vers un modèle batterie (champs : pvPower, pvPowerExact, inverterBrand, existingBattery, householdCount, householdSize, annualConsumption, heatPump, evCount, evPlanned, hasCharger, deadline).
  - Associer `battery` à son action de conversion Ads (voir la porte de lancement ci-dessus).
  - Vérifier que l'e-mail de confirmation au visiteur part quand `dispatch.summary.reasons` contient `not_dispatchable`, et qu'aucun e-mail partenaire n'est envoyé.
  - Vérifier que Make ignore `dispatch.mode` quand `targets` est vide et que `reasons` contient `not_dispatchable`.
