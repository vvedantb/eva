import { describe, expect, it, vi } from "vitest";
import {
  createAltHeldStore,
  type AltHeldSignals,
  type AltHeldStore,
} from "./useAltHeld";

/**
 * The Alt-held store decides whether a destructive action skips its
 * confirmation dialog (fix 4ca72e4a6 wired ~30 delete/archive/reset controls to
 * it). A false positive is the dangerous direction: the user clicks Remove
 * expecting a dialog and the row is gone. So every path that can strand the
 * flag at `true` — a swallowed keyup, a blur, a tab switch, the last subscriber
 * unmounting while Alt is down — is pinned here.
 */
function setup(): {
  store: AltHeldStore;
  signals: () => AltHeldSignals;
  bindCount: () => number;
  unbindCount: () => number;
} {
  let captured: AltHeldSignals | null = null;
  let bound = 0;
  let unbound = 0;
  const store = createAltHeldStore((signals) => {
    captured = signals;
    bound += 1;
    return () => {
      unbound += 1;
    };
  });
  return {
    store,
    signals: () => {
      if (captured === null) throw new Error("binding was never installed");
      return captured;
    },
    bindCount: () => bound,
    unbindCount: () => unbound,
  };
}

const ALT_DOWN = { key: "Alt", altKey: true };
const ALT_UP = { key: "Alt", altKey: false };

describe("createAltHeldStore", () => {
  it("starts unheld and does not bind until something subscribes", () => {
    const { store, bindCount } = setup();
    expect(store.getSnapshot()).toBe(false);
    expect(bindCount()).toBe(0);
  });

  it("tracks Alt down and up, notifying subscribers on each change", () => {
    const { store, signals } = setup();
    const onChange = vi.fn();
    store.subscribe(onChange);

    signals().keyDown(ALT_DOWN);
    expect(store.getSnapshot()).toBe(true);
    expect(onChange).toHaveBeenCalledTimes(1);

    signals().keyUp(ALT_UP);
    expect(store.getSnapshot()).toBe(false);
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("treats any keydown carrying the modifier as Alt held", () => {
    // Alt+Tab back into the window lands a keydown for the other key first;
    // waiting for a literal "Alt" keydown would leave the hint hidden.
    const { store, signals } = setup();
    store.subscribe(vi.fn());
    signals().keyDown({ key: "a", altKey: true });
    expect(store.getSnapshot()).toBe(true);
  });

  it("ignores a keydown without the modifier", () => {
    const { store, signals } = setup();
    store.subscribe(vi.fn());
    signals().keyDown({ key: "a", altKey: false });
    expect(store.getSnapshot()).toBe(false);
  });

  it("stays held when another key is released while Alt is still down", () => {
    // Alt+K then releasing K reports altKey: true — clearing here would drop
    // the skip mid-chord.
    const { store, signals } = setup();
    store.subscribe(vi.fn());
    signals().keyDown(ALT_DOWN);
    signals().keyUp({ key: "k", altKey: true });
    expect(store.getSnapshot()).toBe(true);
  });

  it("clears on a keyup that no longer reports the modifier", () => {
    const { store, signals } = setup();
    store.subscribe(vi.fn());
    signals().keyDown(ALT_DOWN);
    signals().keyUp({ key: "k", altKey: false });
    expect(store.getSnapshot()).toBe(false);
  });

  it("clears on blur / tab hide, where the keyup never arrives", () => {
    const { store, signals } = setup();
    store.subscribe(vi.fn());
    signals().keyDown(ALT_DOWN);
    signals().clear();
    expect(store.getSnapshot()).toBe(false);
  });

  it("does not notify when the value is unchanged", () => {
    const { store, signals } = setup();
    const onChange = vi.fn();
    store.subscribe(onChange);
    signals().keyDown(ALT_DOWN);
    signals().keyDown(ALT_DOWN);
    signals().keyDown({ key: "j", altKey: true });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("resets to unheld once the last subscriber leaves while Alt is down", () => {
    // The regression: Alt+click navigates, every confirmable control unmounts,
    // the listeners come off, and the user releases Alt unobserved. A flag left
    // at `true` makes the next page's first plain click skip its dialog.
    const { store, signals } = setup();
    const unsubscribe = store.subscribe(vi.fn());
    signals().keyDown(ALT_DOWN);
    expect(store.getSnapshot()).toBe(true);

    unsubscribe();
    expect(store.getSnapshot()).toBe(false);

    store.subscribe(vi.fn());
    expect(store.getSnapshot()).toBe(false);
  });

  it("keeps the binding while any subscriber remains", () => {
    const { store, signals, bindCount, unbindCount } = setup();
    const first = store.subscribe(vi.fn());
    store.subscribe(vi.fn());
    expect(bindCount()).toBe(1);

    first();
    expect(unbindCount()).toBe(0);
    signals().keyDown(ALT_DOWN);
    expect(store.getSnapshot()).toBe(true);
  });

  it("unbinds on the last unsubscribe and rebinds on the next subscribe", () => {
    const { store, bindCount, unbindCount } = setup();
    store.subscribe(vi.fn())();
    expect(unbindCount()).toBe(1);

    store.subscribe(vi.fn());
    expect(bindCount()).toBe(2);
  });

  it("delivers changes to every subscriber", () => {
    const { store, signals } = setup();
    const a = vi.fn();
    const b = vi.fn();
    store.subscribe(a);
    store.subscribe(b);
    signals().keyDown(ALT_DOWN);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });
});
