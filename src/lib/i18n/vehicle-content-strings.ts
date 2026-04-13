/**
 * FR/DE template strings for auto-generated vehicle page content.
 * Placeholders use {variableName} syntax.
 */

export function interpolate(
  template: string,
  vars: Record<string, string | number | undefined>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    const val = vars[key];
    return val != null ? String(val) : match;
  });
}

export interface VehicleContentStrings {
  introTitle: string;
  intro: string;
  intro2: string;
  sectionTitles: {
    advice: string;
    cost: string;
    faq: string;
  };
  advice: Record<
    string,
    { description: string; descriptionNotExploited?: string }
  >;
  adviceIntro: string;
  adviceRecommendedLabel: string;
  cost: {
    fullCharge: string;
    daily: string;
    monthly: string;
    homeChargingTitle: string;
    homeChargingIntro: string;
    inputsSubtitle: string;
    inputsLabel: string;
    colScenario: string;
    colKwh: string;
    colKwhSolar: string;
    colKwhNetwork: string;
    colCost: string;
    tariffLabel: string;
    tariffUnit: string;
    dailyKmLabel: string;
    dailyKmUnit: string;
    fuelPriceLabel: string;
    fuelPriceUnit: string;
    fuelConsumptionLabel: string;
    fuelConsumptionUnit: string;
    savingsTitle: string;
    savingsInputsLabel: string;
    savingsCardLabel: string;
    savingsPerMonth: string;
    savingsPerYear: string;
    vsPetrol: string;
    vsEv: string;
    networkTitle: string;
    networkHome: string;
    networkHomeDesc: string;
    networkPublicAc: string;
    networkPublicAcDesc: string;
    networkPublicDc: string;
    networkPublicDcDesc: string;
    networkSavingsVsPublic: string;
    networkIntro: string;
    savingsIntro: string;
    savingsLabel: string;
    lossLabel: string;
    solarLabel: string;
    solarUnit: string;
  };
  faqIntro: string;
  faq: Record<string, { question: string; answer: string; answerAlt?: string }>;
  tooltips: {
    // Hero stat cards
    battery: string;
    range: string;
    dcCharge: string;
    acPower: string;
    efficiency: string;
    pricePerRange: string;
    // DC Fast Charging
    dcPort: string;
    dcMaxPower: string;
    dcAvgPower: string;
    dcTime: string;
    dcSpeed: string;
    preconditioning: string;
    // Smart Charging
    plugCharge: string;
    autocharge: string;
    v2l: string;
    v2h: string;
    v2g: string;
    // Battery Tech Specs
    nominalCapacity: string;
    useableCapacity: string;
    batteryType: string;
    batteryArchitecture: string;
    // Performance
    acceleration: string;
    torque: string;
    driveType: string;
    // Dimensions
    wheelbase: string;
    towingWeight: string;
  };
  related: {
    sectionTitle: string;
    sameBrand: string;
    similar: string;
    featuredPosts: string;
  };
}

export const vehicleContentStrings: Record<"fr" | "de", VehicleContentStrings> =
  {
    fr: {
      introTitle: "Recharger la {name} en Suisse",
      intro:
        "La {brand} {model}, avec sa batterie de {battery} et son autonomie de {range}, se recharge en {chargeTime11kw} à domicile avec une borne 11 kW triphasée. Voici tout ce qu'il faut savoir pour recharger votre {model} chez vous en Suisse\u00a0: temps de recharge par type de prise, coût estimé et conseils d'installation.",
      intro2:
        "Le chargeur embarqué AC de la {model} accepte jusqu'à {acPower}\u00a0— c'est lui qui détermine la vitesse de recharge à domicile ou sur une borne publique lente. En recharge rapide DC, la puissance maximale est de {dcPower}, idéal pour récupérer l'autonomie du quotidien en une courte pause. Avec une consommation de {efficiency}, chaque 100\u00a0km revient à environ {costPer100km}\u00a0CHF au tarif résidentiel suisse moyen (0.32\u00a0CHF/kWh).",

      sectionTitles: {
        advice: "Quelle prise pour recharger votre {brand} {model}\u00a0?",
        cost: "Coût de recharge de la {brand} {model}",
        faq: "Questions fréquentes sur la {name}",
      },

      advice: {
        "wall-plug": {
          description:
            "Dépannage uniquement. {time} pour une charge complète. Risque de surchauffe si utilisation prolongée. Non recommandé comme solution permanente.",
        },
        "1-phase-10a": {
          description:
            "Dépannage uniquement. {time} pour une charge complète. Risque de surchauffe si utilisation prolongée. Non recommandé comme solution permanente.",
        },
        "1-phase-16a": {
          description:
            "Solution économique (~CHF 200-400 d'installation). {time} de charge. Suffisant si vous roulez moins de 50 km/jour.",
          descriptionNotExploited:
            "Solution économique (~CHF 200-400). {time} de charge. Puissance limitée par le chargeur embarqué de votre véhicule à {acMax} kW.",
        },
        "1-phase-32a": {
          description:
            "Bon compromis qualité-prix. {time} de charge. Installation par un électricien certifié ESTI (~CHF 1'500-2'500).",
          descriptionNotExploited:
            "Le chargeur embarqué de votre {model} est limité à {acMax} kW\u00a0: cette borne ne chargera pas plus vite qu'une {acMax} kW.",
        },
        "3-phase-16a": {
          description:
            "Recommandé. {time} de charge. Nécessite un raccordement triphasé (standard en Suisse). Installation ~CHF 2'000-3'500.",
          descriptionNotExploited:
            "Le chargeur embarqué de votre {model} est limité à {acMax} kW\u00a0: cette borne ne chargera pas plus vite qu'une borne {acMax} kW.",
        },
        "3-phase-32a": {
          description:
            "Exploitée pleinement. {time} de charge. Pour les professionnels ou usage intensif. Installation ~CHF 2'500-4'000.",
          descriptionNotExploited:
            "Non exploitée par votre {model} (chargeur embarqué limité à {acMax} kW). Une borne 11 kW offre les mêmes performances pour moins cher.",
        },
      },

      adviceIntro:
        "Le choix de la prise de recharge dépend de votre usage quotidien et de votre installation électrique. Le chargeur embarqué de votre {model} accepte jusqu'à {acMax} kW en courant alternatif\u00a0: une borne plus puissante ne chargera pas plus vite que cette limite. Voici nos recommandations par type de branchement.",

      adviceRecommendedLabel: "Recommandé",

      cost: {
        fullCharge: "Charge utile (10→80%)",
        daily: "Charge quotidienne (~{dailyKm} km)",
        monthly: "Coût mensuel (~{monthlyKm} km/mois)",
        homeChargingTitle: "Recharge à domicile",
        homeChargingIntro: "Le tableau ci-dessous estime le coût de recharge à domicile selon trois scénarios\u00a0: une charge utile (10→80\u00a0%), une charge quotidienne basée sur votre distance journalière, et le coût mensuel projeté. Les valeurs sont calculées en temps réel selon votre tarif d'électricité et, si vous avez une installation solaire, la part couverte par votre propre production.",
        inputsSubtitle: "Combien coûte la recharge à domicile, sur le réseau public ou en comparaison avec un véhicule thermique\u00a0? Simulez vos coûts mensuels en ajustant les paramètres ci-dessous.",
        inputsLabel: "Vos paramètres de simulation",
        colScenario: "Scénario",
        colKwh: "kWh",
        colKwhSolar: "☀ Production solaire",
        colKwhNetwork: "Cons. réseau",
        colCost: "Coût",
        tariffLabel: "Votre tarif",
        tariffUnit: "CHF/kWh",
        dailyKmLabel: "Distance journalière",
        dailyKmUnit: "km",
        fuelPriceLabel: "Prix essence",
        fuelPriceUnit: "CHF/L",
        fuelConsumptionLabel: "Conso.",
        fuelConsumptionUnit: "L/100km",
        savingsTitle: "Coût selon la technologie",
        savingsInputsLabel: "Paramètres du véhicule thermique",
        savingsCardLabel: "Coût selon la technologie",
        savingsPerMonth: "mois",
        savingsPerYear: "an",
        vsPetrol: "Véhicule thermique",
        vsEv: "Véhicule électrique",
        networkTitle: "Coût selon le lieu de recharge",
        networkHome: "Charge à domicile",
        networkHomeDesc: "Borne murale / wallbox",
        networkPublicAc: "Charge publique AC",
        networkPublicAcDesc: "Supermarché, parking (~0.45 CHF/kWh)",
        networkPublicDc: "Charge publique DC (rapide)",
        networkPublicDcDesc: "Autoroute, GoFast, Ionity (~0.65 CHF/kWh)",
        networkSavingsVsPublic: "Domicile vs. réseau public",
        networkIntro:
          "Le lieu de recharge influe directement sur votre budget. Recharger à domicile avec votre propre borne wallbox est jusqu'à 2 à 3 fois moins cher que sur le réseau public suisse. Voici la comparaison pour votre kilométrage.",
        savingsIntro:
          "Rouler à l'électrique est nettement plus économique qu'un véhicule thermique équivalent. L'écart se creuse encore si vous rechargez principalement à domicile au tarif résidentiel.",
        savingsLabel: "Économies de",
        lossLabel: "Perte de",
        solarLabel: "Installation photovoltaïque",
        solarUnit: "%",
      },

      tooltips: {
        battery: "Capacité totale de la batterie haute tension du véhicule. Détermine l'autonomie maximale et le coût par recharge.",
        range: "Autonomie selon le cycle WLTP (Worldwide Harmonized Light Vehicles Test Procedure). L'autonomie réelle varie selon la température, le style de conduite et le relief.",
        dcCharge: "Puissance maximale acceptée en courant continu (DC) sur une borne rapide. Plus la valeur est élevée, plus la recharge rapide est rapide.",
        acPower: "Puissance maximale du chargeur embarqué en courant alternatif (AC). Détermine la vitesse de recharge à domicile ou sur une borne publique AC.",
        efficiency: "Consommation d'énergie en Wh par km. Plus la valeur est basse, plus le véhicule est économe en énergie.",
        pricePerRange: "Coût estimé en électricité par kilomètre d'autonomie, basé sur le tarif moyen suisse.",
        dcPort: "Type de connecteur utilisé pour la recharge rapide DC. CCS (Combined Charging System) est le standard européen.",
        dcMaxPower: "Puissance de charge maximale atteignable en pointe sur une borne rapide DC. La puissance réelle diminue au fur et à mesure que la batterie se remplit.",
        dcAvgPower: "Puissance moyenne entre 10% et 80% de charge. Indicateur plus réaliste que la puissance maximale pour estimer le temps de recharge rapide.",
        dcTime: "Temps nécessaire pour passer de 10% à 80% sur une borne rapide DC. Au-delà de 80%, la vitesse de charge ralentit significativement.",
        dcSpeed: "Kilomètres d'autonomie récupérés par minute de charge rapide DC.",
        preconditioning: "Le véhicule préchauffe ou refroidit la batterie avant d'arriver à une borne rapide pour optimiser la vitesse de charge.",
        plugCharge: "Plug & Charge permet de lancer la recharge simplement en branchant le câble, sans badge ni application. L'authentification se fait automatiquement.",
        autocharge: "La borne reconnaît automatiquement le véhicule (par adresse MAC) et lance la recharge sans intervention.",
        v2l: "Vehicle-to-Load\u00a0: le véhicule peut alimenter des appareils électriques externes (jusqu'à la puissance indiquée) via une prise intégrée.",
        v2h: "Vehicle-to-Home\u00a0: le véhicule peut alimenter votre domicile en cas de coupure de courant ou pour optimiser votre autoconsommation solaire.",
        v2g: "Vehicle-to-Grid\u00a0: le véhicule peut réinjecter de l'énergie dans le réseau électrique, permettant de vendre de l'électricité aux heures de pointe.",
        nominalCapacity: "Capacité physique totale de la batterie. Une partie est réservée comme tampon de sécurité par le constructeur.",
        useableCapacity: "Capacité réellement disponible pour la conduite, après déduction du tampon de sécurité. C'est cette valeur qui détermine l'autonomie.",
        batteryType: "Chimie des cellules de la batterie. Les types courants sont NMC (nickel-manganèse-cobalt) et LFP (lithium-fer-phosphate).",
        batteryArchitecture: "Tension nominale du pack batterie. Une tension plus élevée (800V) permet une charge rapide plus puissante.",
        acceleration: "Temps pour passer de 0 à 100 km/h. Les véhicules électriques ont un couple instantané, offrant des accélérations souvent supérieures aux thermiques.",
        torque: "Force de rotation du moteur. Sur un véhicule électrique, le couple maximal est disponible dès 0 km/h.",
        driveType: "Configuration de transmission\u00a0: traction (avant), propulsion (arrière) ou intégrale (AWD, 4 roues motrices).",
        wheelbase: "Distance entre les essieux avant et arrière. Un empattement plus long offre généralement plus d'espace intérieur et de stabilité.",
        towingWeight: "Poids maximal remorquable avec une remorque freinée. Vérifiez la compatibilité avec votre attelage.",
      },

      faqIntro:
        "Questions fréquentes sur la recharge de la {name} en Suisse, basées sur ses données techniques.",

      faq: {
        chargeTime: {
          question:
            "Combien de temps pour recharger la {name} à domicile\u00a0?",
          answer:
            "{chargeTime11kw} avec une borne 11 kW triphasée, {chargeTime2_3kw} avec une prise domestique 2.3 kW. Le chargeur embarqué de la {model} accepte un maximum de {acMax} kW en courant alternatif.",
        },
        whichCharger: {
          question: "Quelle borne choisir pour la {name}\u00a0?",
          answer:
            "Une borne 11 kW triphasée est recommandée pour la {model}. Le chargeur embarqué accepte jusqu'à {acMax} kW en AC. {notExploitedNote}",
        },
        costPerCharge: {
          question:
            "Combien coûte une recharge complète de la {name} en Suisse\u00a0?",
          answer:
            "Environ CHF {fullChargeCost} à domicile au tarif moyen suisse de CHF {tariff}/kWh. Pour un usage quotidien de 50 km, comptez environ CHF {dailyCost} par jour.",
        },
        installation: {
          question:
            "Faut-il une installation spéciale pour recharger la {name}\u00a0?",
          answer:
            "Une borne murale nécessite un raccordement par un électricien certifié ESTI. En Suisse, la plupart des habitations disposent déjà d'un raccordement triphasé, ce qui facilite l'installation d'une borne 11 kW.",
        },
        fastCharging: {
          question:
            "La {name} est-elle compatible avec la recharge rapide\u00a0?",
          answer:
            "Oui, via port {dcPort}, jusqu'à {dcMaxPower} de puissance maximale. Temps de charge de 10% à 80%\u00a0: {dcTime}.",
          answerAlt:
            "Ce véhicule ne dispose pas de recharge rapide DC.",
        },
        realRange: {
          question:
            "Quelle est l'autonomie réelle de la {name} en Suisse\u00a0?",
          answer:
            "{rangeMax} km en conditions optimales (temps doux, ville). En hiver\u00a0: {coldCombined} km. Sur autoroute\u00a0: {mildHighway} km.",
          answerAlt:
            "L'autonomie WLTP annoncée est de {range}. Les conditions réelles (température, conduite, terrain) peuvent faire varier cette valeur.",
        },
      },

      related: {
        sectionTitle: "\u00c0 d\u00e9couvrir en lien avec la {brand} {model}",
        sameBrand: "Autres {brand}",
        similar: "V\u00e9hicules similaires",
        featuredPosts: "Nos guides recharge",
      },
    },

    de: {
      introTitle: "{name} in der Schweiz laden",
      intro:
        "Der {brand} {model} mit seiner {battery}-Batterie und einer Reichweite von {range} lässt sich zu Hause mit einer 11-kW-Dreiphasen-Wallbox in {chargeTime11kw} vollständig laden. Hier finden Sie alles Wissenswerte zum Laden Ihres {model} zu Hause in der Schweiz\u00a0: Ladezeiten nach Steckertyp, geschätzte Kosten und Installationshinweise.",
      intro2:
        "Das On-Board-Ladegerät des {model} unterstützt bis zu {acPower} Wechselstrom\u00a0— dieser Wert bestimmt die Ladegeschwindigkeit zu Hause oder an einer öffentlichen AC-Ladestation. Beim DC-Schnellladen sind bis zu {dcPower} möglich, genug, um in einer kurzen Pause ausreichend Reichweite für den Alltag zu laden. Bei einem Verbrauch von {efficiency} kostet 100\u00a0km zum Schweizer Haushaltsdurchschnittstarif (0,32\u00a0CHF/kWh) etwa {costPer100km}\u00a0CHF.",

      sectionTitles: {
        advice: "Welcher Anschluss zum Laden Ihres {brand} {model}\u00a0?",
        cost: "Ladekosten für den {brand} {model}",
        faq: "Häufige Fragen zum {name}",
      },

      advice: {
        "wall-plug": {
          description:
            "Nur als Notlösung. {time} für eine Vollladung. Überhitzungsgefahr bei Dauerbetrieb. Nicht als Dauerlösung empfohlen.",
        },
        "1-phase-10a": {
          description:
            "Nur als Notlösung. {time} für eine Vollladung. Überhitzungsgefahr bei Dauerbetrieb. Nicht als Dauerlösung empfohlen.",
        },
        "1-phase-16a": {
          description:
            "Günstige Lösung (~CHF 200-400 Installation). {time} Ladezeit. Ausreichend, wenn Sie weniger als 50 km/Tag fahren.",
          descriptionNotExploited:
            "Günstige Lösung (~CHF 200-400). {time} Ladezeit. Leistung begrenzt durch das On-Board-Ladegerät Ihres Fahrzeugs auf {acMax} kW.",
        },
        "1-phase-32a": {
          description:
            "Gutes Preis-Leistungs-Verhältnis. {time} Ladezeit. Installation durch ESTI-zertifizierten Elektriker (~CHF 1'500-2'500).",
          descriptionNotExploited:
            "Das On-Board-Ladegerät Ihres {model} ist auf {acMax} kW begrenzt\u00a0: Diese Wallbox lädt nicht schneller als eine {acMax}-kW-Wallbox.",
        },
        "3-phase-16a": {
          description:
            "Empfohlen. {time} Ladezeit. Erfordert Dreiphasenanschluss (in der Schweiz Standard). Installation ~CHF 2'000-3'500.",
          descriptionNotExploited:
            "Das On-Board-Ladegerät Ihres {model} ist auf {acMax} kW begrenzt\u00a0: Diese Wallbox lädt nicht schneller als eine {acMax}-kW-Wallbox.",
        },
        "3-phase-32a": {
          description:
            "Volle Ausnutzung. {time} Ladezeit. Für Gewerbetreibende oder intensive Nutzung. Installation ~CHF 2'500-4'000.",
          descriptionNotExploited:
            "Wird von Ihrem {model} nicht ausgenutzt (On-Board-Ladegerät begrenzt auf {acMax} kW). Eine 11-kW-Wallbox bietet die gleiche Leistung für weniger Geld.",
        },
      },

      adviceIntro:
        "Die Wahl des Ladeanschlusses hängt von Ihrer täglichen Nutzung und Ihrer Elektroinstallation ab. Das On-Board-Ladegerät Ihres {model} akzeptiert maximal {acMax} kW Wechselstrom\u00a0: Eine leistungsstärkere Wallbox lädt nicht schneller als dieses Limit. Hier unsere Empfehlungen nach Anschlusstyp.",

      adviceRecommendedLabel: "Empfohlen",

      cost: {
        fullCharge: "Nutzladung (10→80%)",
        daily: "Tägliches Laden (~{dailyKm} km)",
        monthly: "Monatskosten (~{monthlyKm} km/Monat)",
        homeChargingTitle: "Laden zu Hause",
        homeChargingIntro: "Die folgende Tabelle schätzt die Ladekosten zu Hause in drei Szenarien\u00a0: eine Nutzladung (10→80\u00a0%), eine tägliche Ladung basierend auf Ihrer täglichen Fahrleistung und die monatlichen Gesamtkosten. Die Werte werden in Echtzeit anhand Ihres Stromtarifs berechnet – und bei einer Photovoltaikanlage unter Berücksichtigung Ihres Eigenverbrauchsanteils.",
        inputsSubtitle: "Was kostet das Laden zu Hause, an öffentlichen Stationen oder im Vergleich zum Verbrenner\u00a0? Simulieren Sie Ihre monatlichen Kosten, indem Sie die Parameter unten anpassen.",
        inputsLabel: "Ihre Simulationsparameter",
        colScenario: "Szenario",
        colKwh: "kWh",
        colKwhSolar: "☀ Solarproduktion",
        colKwhNetwork: "Netzverbrauch",
        colCost: "Kosten",
        tariffLabel: "Ihr Tarif",
        tariffUnit: "CHF/kWh",
        dailyKmLabel: "Tägliche Strecke",
        dailyKmUnit: "km",
        fuelPriceLabel: "Benzinpreis",
        fuelPriceUnit: "CHF/L",
        fuelConsumptionLabel: "Verbr.",
        fuelConsumptionUnit: "L/100km",
        savingsTitle: "Kosten nach Technologie",
        savingsInputsLabel: "Parameter des Verbrenners",
        savingsCardLabel: "Kosten nach Technologie",
        savingsPerMonth: "Monat",
        savingsPerYear: "Jahr",
        vsPetrol: "Verbrenner",
        vsEv: "Elektrofahrzeug",
        networkTitle: "Kosten nach Ladeort",
        networkHome: "Laden zu Hause",
        networkHomeDesc: "Wallbox / Ladestation",
        networkPublicAc: "Öffentlich laden AC",
        networkPublicAcDesc: "Supermarkt, Parkhaus (~0.45 CHF/kWh)",
        networkPublicDc: "Öffentlich laden DC (Schnell)",
        networkPublicDcDesc: "Autobahn, GoFast, Ionity (~0.65 CHF/kWh)",
        networkSavingsVsPublic: "Zuhause vs. öffentliches Netz",
        networkIntro:
          "Der Ladeort beeinflusst Ihr Budget direkt. Das Laden zu Hause mit Ihrer eigenen Wallbox ist bis zu 2- bis 3-mal günstiger als an öffentlichen Ladestationen in der Schweiz. Hier der Vergleich für Ihre Kilometerleistung.",
        savingsIntro:
          "Elektrisch fahren ist deutlich günstiger als ein vergleichbares Verbrennerfahrzeug. Der Unterschied wird noch grösser, wenn Sie hauptsächlich zu Hause zum Haushaltstarif laden.",
        savingsLabel: "Einsparungen von",
        lossLabel: "Verlust von",
        solarLabel: "Photovoltaikanlage",
        solarUnit: "%",
      },

      tooltips: {
        battery: "Gesamtkapazität der Hochvoltbatterie des Fahrzeugs. Bestimmt die maximale Reichweite und die Kosten pro Ladung.",
        range: "Reichweite nach WLTP-Zyklus (Worldwide Harmonized Light Vehicles Test Procedure). Die tatsächliche Reichweite variiert je nach Temperatur, Fahrstil und Gelände.",
        dcCharge: "Maximale Gleichstrom-Ladeleistung (DC) an einer Schnellladestation. Je höher der Wert, desto schneller die Schnellladung.",
        acPower: "Maximale Ladeleistung des On-Board-Ladegeräts für Wechselstrom (AC). Bestimmt die Ladegeschwindigkeit zu Hause oder an öffentlichen AC-Ladestationen.",
        efficiency: "Energieverbrauch in Wh pro km. Je niedriger der Wert, desto sparsamer ist das Fahrzeug.",
        pricePerRange: "Geschätzte Stromkosten pro Kilometer Reichweite, basierend auf dem schweizerischen Durchschnittstarif.",
        dcPort: "Steckertyp für DC-Schnellladung. CCS (Combined Charging System) ist der europäische Standard.",
        dcMaxPower: "Maximale Spitzenladeleistung an einer DC-Schnellladestation. Die tatsächliche Leistung sinkt mit zunehmendem Ladestand.",
        dcAvgPower: "Durchschnittliche Ladeleistung zwischen 10% und 80%. Ein realistischerer Indikator als die Spitzenleistung für die Schätzung der Schnellladezeit.",
        dcTime: "Benötigte Zeit, um von 10% auf 80% an einer DC-Schnellladestation zu laden. Über 80% hinaus verlangsamt sich die Ladegeschwindigkeit deutlich.",
        dcSpeed: "Kilometer Reichweite pro Minute DC-Schnellladung.",
        preconditioning: "Das Fahrzeug wärmt oder kühlt die Batterie vor der Ankunft an einer Schnellladestation vor, um die Ladegeschwindigkeit zu optimieren.",
        plugCharge: "Plug & Charge ermöglicht das Starten des Ladevorgangs durch einfaches Einstecken des Kabels, ohne Ladekarte oder App. Die Authentifizierung erfolgt automatisch.",
        autocharge: "Die Ladestation erkennt das Fahrzeug automatisch (über MAC-Adresse) und startet den Ladevorgang ohne Eingriff.",
        v2l: "Vehicle-to-Load\u00a0: Das Fahrzeug kann externe elektrische Geräte (bis zur angegebenen Leistung) über eine integrierte Steckdose versorgen.",
        v2h: "Vehicle-to-Home\u00a0: Das Fahrzeug kann Ihr Zuhause bei Stromausfall versorgen oder den Eigenverbrauch Ihrer Solaranlage optimieren.",
        v2g: "Vehicle-to-Grid\u00a0: Das Fahrzeug kann Energie ins Stromnetz zurückspeisen, um zu Spitzenzeiten Strom zu verkaufen.",
        nominalCapacity: "Physische Gesamtkapazität der Batterie. Ein Teil wird vom Hersteller als Sicherheitspuffer reserviert.",
        useableCapacity: "Tatsächlich für das Fahren verfügbare Kapazität nach Abzug des Sicherheitspuffers. Dieser Wert bestimmt die Reichweite.",
        batteryType: "Zellchemie der Batterie. Gängige Typen sind NMC (Nickel-Mangan-Kobalt) und LFP (Lithium-Eisenphosphat).",
        batteryArchitecture: "Nennspannung des Batteriepacks. Eine höhere Spannung (800V) ermöglicht eine leistungsstärkere Schnellladung.",
        acceleration: "Zeit von 0 auf 100 km/h. Elektrofahrzeuge haben ein sofortiges Drehmoment und bieten oft bessere Beschleunigungswerte als Verbrenner.",
        torque: "Drehkraft des Motors. Bei Elektrofahrzeugen steht das maximale Drehmoment ab 0 km/h zur Verfügung.",
        driveType: "Antriebskonfiguration\u00a0: Frontantrieb, Heckantrieb oder Allradantrieb (AWD).",
        wheelbase: "Abstand zwischen Vorder- und Hinterachse. Ein längerer Radstand bietet in der Regel mehr Innenraum und Stabilität.",
        towingWeight: "Maximale Anhängelast mit gebremsten Anhänger. Prüfen Sie die Kompatibilität mit Ihrer Anhängerkupplung.",
      },

      faqIntro:
        "Häufige Fragen zur Ladung des {name} in der Schweiz, basierend auf den technischen Daten des Fahrzeugs.",

      faq: {
        chargeTime: {
          question: "Wie lange dauert das Laden des {name} zu Hause\u00a0?",
          answer:
            "{chargeTime11kw} mit einer 11-kW-Dreiphasen-Wallbox, {chargeTime2_3kw} mit einer Haushaltssteckdose (2,3 kW). Das On-Board-Ladegerät des {model} akzeptiert maximal {acMax} kW Wechselstrom.",
        },
        whichCharger: {
          question: "Welche Wallbox für den {name}\u00a0?",
          answer:
            "Eine 11-kW-Dreiphasen-Wallbox wird für den {model} empfohlen. Das On-Board-Ladegerät akzeptiert bis zu {acMax} kW AC. {notExploitedNote}",
        },
        costPerCharge: {
          question:
            "Was kostet eine Vollladung des {name} in der Schweiz\u00a0?",
          answer:
            "Etwa CHF {fullChargeCost} zu Hause beim schweizerischen Durchschnittstarif von CHF {tariff}/kWh. Für eine tägliche Nutzung von 50 km rechnen Sie mit etwa CHF {dailyCost} pro Tag.",
        },
        installation: {
          question:
            "Brauche ich eine spezielle Installation zum Laden des {name}\u00a0?",
          answer:
            "Eine Wallbox erfordert die Installation durch einen ESTI-zertifizierten Elektriker. In der Schweiz verfügen die meisten Wohngebäude bereits über einen Dreiphasenanschluss, was die Installation einer 11-kW-Wallbox erleichtert.",
        },
        fastCharging: {
          question:
            "Ist der {name} mit Schnellladung kompatibel\u00a0?",
          answer:
            "Ja, über {dcPort}-Anschluss mit bis zu {dcMaxPower} maximaler Ladeleistung. Ladezeit von 10% auf 80%\u00a0: {dcTime}.",
          answerAlt:
            "Dieses Fahrzeug verfügt nicht über DC-Schnellladung.",
        },
        realRange: {
          question:
            "Welche reale Reichweite hat der {name} in der Schweiz\u00a0?",
          answer:
            "{rangeMax} km unter optimalen Bedingungen (mildes Wetter, Stadt). Im Winter\u00a0: {coldCombined} km. Auf der Autobahn\u00a0: {mildHighway} km.",
          answerAlt:
            "Die angegebene WLTP-Reichweite beträgt {range}. Reale Bedingungen (Temperatur, Fahrweise, Gelände) können diesen Wert beeinflussen.",
        },
      },

      related: {
        sectionTitle: "Entdecken Sie mehr zum {brand} {model}",
        sameBrand: "Weitere {brand}-Modelle",
        similar: "\u00c4hnliche Fahrzeuge",
        featuredPosts: "Unsere Ladeleitf\u00e4den",
      },
    },
  };
