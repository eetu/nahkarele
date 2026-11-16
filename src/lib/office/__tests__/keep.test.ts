import { describe, expect, it } from "vitest";

import { cookieStart, startOf } from "../keep";

const AT = 1_794_819_384_515;

describe("friday's start in its cookie", () => {
  it("is read among other cookies, wherever it stands", () => {
    expect(cookieStart(`friday=${AT}`)).toBe(AT);
    expect(cookieStart(`a=1; friday=${AT}; b=2`)).toBe(AT);
    expect(cookieStart(`a=1;friday=${AT}`)).toBe(AT);
  });

  it("is only a whole number of 10 to 13 digits under its own name", () => {
    expect(cookieStart("")).toBeNull();
    expect(cookieStart("friday=")).toBeNull();
    expect(cookieStart("friday=123456789")).toBeNull();
    expect(cookieStart("friday=12345678901234")).toBeNull();
    expect(cookieStart(`friday=${AT}.5`)).toBeNull();
    expect(cookieStart(`notfriday=${AT}`)).toBeNull();
  });
});

describe("friday's start on load", () => {
  it("is localStorage's while it has one", () => {
    expect(startOf(String(AT), `friday=${AT - 5000}`)).toBe(AT);
  });

  it("is the cookie's once localStorage has lost it", () => {
    expect(startOf(null, `friday=${AT}`)).toBe(AT);
    expect(startOf("", `friday=${AT}`)).toBe(AT);
    expect(startOf("junk", `friday=${AT}`)).toBe(AT);
  });

  it("is none with neither", () => {
    expect(startOf(null, "")).toBeNull();
    expect(startOf("0", "other=1")).toBeNull();
  });
});
