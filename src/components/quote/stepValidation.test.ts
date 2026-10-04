import { describe, it, expect } from "vitest";
import { contactFirstUnanswered, type ContactFields } from "./stepValidation";

const complete: ContactFields = {
  firstName: "A",
  lastName: "B",
  email: "a@b.ch",
  phone: "0791234567",
  phoneCountry: "CH",
  addressMode: "google",
  address: "Rue 1, 1000 Lausanne",
  postalCode: "1000",
  locality: "Lausanne",
  canton: "VD",
  streetName: "",
  streetNb: "",
  acceptTerms: true,
};

describe("contactFirstUnanswered", () => {
  it("returns null when everything is answered", () => {
    expect(contactFirstUnanswered(complete)).toBeNull();
  });

  it("asks the address first (visual order), then name, email, phone", () => {
    expect(contactFirstUnanswered({ ...complete, canton: "", firstName: "" })).toBe("address");
    expect(contactFirstUnanswered({ ...complete, addressMode: "manual", streetName: "", address: "" })).toBe("address");
    expect(contactFirstUnanswered({ ...complete, firstName: " " })).toBe("firstName");
    expect(contactFirstUnanswered({ ...complete, email: "not-an-email" })).toBe("email");
    expect(contactFirstUnanswered({ ...complete, phone: "1" })).toBe("phone");
  });

  it("requires consent last — it sits under the submit button", () => {
    expect(contactFirstUnanswered({ ...complete, acceptTerms: false })).toBe("acceptTerms");
    expect(contactFirstUnanswered({ ...complete, email: "", acceptTerms: false })).toBe("email");
  });

  it("manual address needs street, number, postal code, locality and canton", () => {
    const manual = { ...complete, addressMode: "manual", address: "", streetName: "Rue", streetNb: "1" };
    expect(contactFirstUnanswered(manual)).toBeNull();
    expect(contactFirstUnanswered({ ...manual, streetNb: "" })).toBe("address");
  });
});
