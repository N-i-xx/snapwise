import { describe, expect, it } from "vitest";
import { compactJson, renderScVal, shortAddress } from "../src/scval.js";
import type { Json } from "../src/snapshot.js";

const ADDR = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAITA4";

describe("renderScVal", () => {
  it.each([
    [{ i128: "250" }, "250i128"],
    [{ u32: 7 }, "7u32"],
    [{ u64: "18446744073709551615" }, "18446744073709551615u64"],
    [{ bool: true }, "true"],
    [{ symbol: "Admin" }, "Admin"],
    [{ string: 'say "hi"' }, '"say \\"hi\\""'],
    [{ bytes: "00ff" }, "0x00ff"],
    ["void", "()"],
    [{ address: ADDR }, "CAAA…ITA4"],
    [{ vec: [{ u32: 1 }, { u32: 2 }] }, "[1u32, 2u32]"],
    [{ vec: null }, "[]"],
    [{ map: [{ key: { symbol: "amount" }, val: { i128: "5" } }] }, "{amount: 5i128}"],
    [{ ledger_key_nonce: { nonce: "42" } }, "nonce(42)"],
    [{ error: { contract: 2 } }, "Error(contract: 2)"],
  ])("renders %j as %s", (input, expected) => {
    expect(renderScVal(input)).toBe(expected);
  });

  it("renders symbol-led vectors as enum variants only when asked", () => {
    const key: Json = { vec: [{ symbol: "Shares" }, { address: ADDR }] };
    expect(renderScVal(key)).toBe("[Shares, CAAA…ITA4]");
    expect(renderScVal(key, { enumStyle: true })).toBe("Shares(CAAA…ITA4)");
    expect(renderScVal({ vec: [{ symbol: "Admin" }] }, { enumStyle: true })).toBe("Admin");
  });

  it("falls back to compact JSON for unknown variants", () => {
    expect(renderScVal({ some_future_type: { b: 1, a: 2 } })).toBe(
      '{"some_future_type":{"a":2,"b":1}}',
    );
  });

  it("truncates long values", () => {
    expect(renderScVal({ string: "x".repeat(50) }, { maxLength: 10 })).toBe('"xxxxxxxx…');
  });

  it("can print full addresses", () => {
    expect(renderScVal({ address: ADDR }, { fullAddresses: true })).toBe(ADDR);
  });
});

describe("helpers", () => {
  it("shortens only long strkeys", () => {
    expect(shortAddress(ADDR)).toBe("CAAA…ITA4");
    expect(shortAddress("short")).toBe("short");
  });

  it("produces key-order independent JSON", () => {
    expect(compactJson({ b: 1, a: [{ d: 1, c: 2 }] })).toBe(
      compactJson({ a: [{ c: 2, d: 1 }], b: 1 }),
    );
  });
});
