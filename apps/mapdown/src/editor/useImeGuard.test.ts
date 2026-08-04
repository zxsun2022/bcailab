import { describe, expect, it } from "vitest";
import {
  COMPOSITION_GRACE_MS,
  inspectImeEvent,
  type ImeGuardState
} from "./useImeGuard";

const key = (isComposing = false, keyCode = 13) => ({ isComposing, keyCode });

describe("IME command guard", () => {
  it("gives the hook-owned composition flag first priority", () => {
    const state: ImeGuardState = { composing: true, endedAt: null };
    expect(inspectImeEvent(state, key(), 100)).toMatchObject({
      imeOwned: true,
      reason: "composing-flag"
    });
  });

  it("recognises the browser isComposing signal", () => {
    const state: ImeGuardState = { composing: false, endedAt: null };
    expect(inspectImeEvent(state, key(true), 100)).toMatchObject({
      imeOwned: true,
      reason: "isComposing"
    });
  });

  it("recognises the legacy Windows IME keyCode 229 signal", () => {
    const state: ImeGuardState = { composing: false, endedAt: null };
    expect(inspectImeEvent(state, key(false, 229), 100)).toMatchObject({
      imeOwned: true,
      reason: "keycode-229"
    });
  });

  it("guards strictly inside the post-composition window", () => {
    const state: ImeGuardState = { composing: false, endedAt: 1_000 };
    expect(inspectImeEvent(state, key(), 1_000 + COMPOSITION_GRACE_MS - 1)).toMatchObject({
      imeOwned: true,
      reason: "post-composition-window",
      sinceCompositionEnd: COMPOSITION_GRACE_MS - 1
    });
    expect(inspectImeEvent(state, key(), 1_000 + COMPOSITION_GRACE_MS)).toMatchObject({
      imeOwned: false,
      reason: "none",
      sinceCompositionEnd: COMPOSITION_GRACE_MS
    });
  });

  it("allows genuine commands when composition has never started", () => {
    const state: ImeGuardState = { composing: false, endedAt: null };
    expect(inspectImeEvent(state, key(), 100)).toEqual({
      imeOwned: false,
      reason: "none",
      sinceCompositionEnd: null
    });
  });
});
