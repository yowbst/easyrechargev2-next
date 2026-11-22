import { describe, expect, it } from "vitest";
import { csvCell, EXPORT_COLUMNS, toCsv } from "./export";
import type { CmsCompany } from "./types";

const row = (over: Record<string, unknown>) =>
  ({ id: "1", ehraid: "1", status: "draft", canton: "ZH", uid: "CHE107036057", partner: null, ...over }) as CmsCompany;

describe("csvCell", () => {
  it("quotes cells with commas, quotes, semicolons and newlines", () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("a;b")).toBe('"a;b"');
    expect(csvCell("a\nb")).toBe('"a\nb"');
    expect(csvCell(null)).toBe("");
    expect(csvCell(12)).toBe("12");
  });
});

describe("toCsv", () => {
  it("writes a header, formats the UID and prefers display_name and the override", () => {
    const csv = toCsv([
      row({
        legal_name: "Müller, Elektro AG",
        display_name: "Müller Elektro",
        classification: "other",
        classification_override: "installer",
        contact_person_name: "A. Müller",
        contact_person_role: "Geschäftsführer",
        partner: "p1",
      }),
    ]);
    const [header, line] = csv.trim().split("\n");
    expect(header.split(",")).toEqual([...EXPORT_COLUMNS]);
    expect(line).toContain("Müller Elektro");
    expect(line).toContain("CHE-107.036.057");
    expect(line).toContain("installer");
    expect(line).toContain('"A. Müller, Geschäftsführer"');
    expect(line).toContain("yes");
  });

  it("leaves empty contacts blank", () => {
    const csv = toCsv([row({ legal_name: "X" })]);
    expect(csv.trim().split("\n")[1].startsWith("X,")).toBe(true);
  });
});
