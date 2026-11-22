import { describe, expect, it } from "vitest";
import { isInstallerCandidate, sparqlStringLiteral } from "./candidates";
import golden from "./__fixtures__/purposes-golden.json";

describe("isInstallerCandidate", () => {
  it("accepts every golden purpose a human labelled installer, inspector or planner", () => {
    const relevant = golden.filter((g) => g.expected !== "other");
    expect(relevant.length).toBeGreaterThan(50);
    const misses = relevant.filter((g) => !isInstallerCandidate(g.purpose)).map((g) => g.name);
    expect(misses).toEqual([]);
  });

  it.each([
    "installations électriques et téléphoniques",
    "Entreprise d'électricité générale",
    "Betrieb eines Elektroinstallationsgeschäftes",
    "Die Gesellschaft bezweckt Elektro-Installationen aller Art",
    "progettazione e realizzazione di impianti elettrici",
    "Elettricista indipendente",
    "courant fort et courant faible",
  ])("accepts %s", (purpose) => {
    expect(isInstallerCandidate(purpose)).toBe(true);
  });

  it.each([
    "Fabrication et vente de pain et de pâtisserie",
    "commerce d'appareils électroménagers",
    "vente de produits électroniques grand public",
    "développement de logiciels et conseil informatique",
    "Handel mit Haushaltgeräten",
    "gestione di un ristorante",
    "",
  ])("rejects %j", (purpose) => {
    expect(isInstallerCandidate(purpose)).toBe(false);
  });

  it("handles null and undefined", () => {
    expect(isInstallerCandidate(null)).toBe(false);
    expect(isInstallerCandidate(undefined)).toBe(false);
  });
});

describe("sparqlStringLiteral", () => {
  it("escapes backslashes and quotes", () => {
    expect(sparqlStringLiteral('a\\b"c')).toBe('"a\\\\b\\"c"');
  });
});

import { installationEvidence } from "./candidates";

describe("installationEvidence", () => {
  it.each([
    "installations électriques et téléphoniques",
    "exploitation d'une entreprise générale d'électricité",
    "Ausführung aller elektrischen Installationen",
    "Projektierung von Stark- und Schwachstromanlagen",
    "impianti elettrici civili",
  ])("explicit: %s", (p) => expect(installationEvidence(p)).toBe("explicit"));

  it.each([
    "Dienstleistungen in der Gebäudetechnik",
    "elektrotechnische Beratungen",
    "gestion de projets dans le domaine de la construction",
    "",
  ])("weak: %j", (p) => expect(installationEvidence(p)).toBe("weak"));
});
