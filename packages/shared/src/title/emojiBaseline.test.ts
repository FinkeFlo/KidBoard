import emojiData from "emojibase-data/en/data.json";
import { describe, expect, it } from "vitest";

import { DEFAULT_COUNTDOWN_EMOJIS } from "../config";
import { isEmojiGrapheme } from "../primitives";
import {
  DEFAULT_EVENT_ICON,
  DEFAULT_MEAL_ICON,
  FALLBACK_ICON_TABLE,
} from "./fallbackIcons";

/** Emoji version baseline of every built-in icon (ADR-0011: Emoji 13.0, Android 11). */
const BASELINE = 13;

interface EmojibaseEntry {
  emoji: string;
  version: number;
  skins?: EmojibaseEntry[];
}

const VS16 = /️/gu;
const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

/** Emoji (without VS16) -> emoji version, including skin tone variants. */
const VERSIONS = new Map<string, number>();
function register(entry: EmojibaseEntry): void {
  VERSIONS.set(entry.emoji.replace(VS16, ""), entry.version);
  entry.skins?.forEach(register);
}
(emojiData as EmojibaseEntry[]).forEach(register);

/** Emoji graphemes of `text` that are newer than the baseline or unknown to the data set. */
function tooNew(text: string): string[] {
  const bad: string[] = [];
  for (const { segment } of segmenter.segment(text)) {
    if (!isEmojiGrapheme(segment)) {
      continue;
    }
    const version = VERSIONS.get(segment.replace(VS16, ""));
    if (version === undefined || version > BASELINE) {
      bad.push(segment);
    }
  }
  return bad;
}

describe("emoji baseline (ADR-0011)", () => {
  it("knows the version of well-known emoji", () => {
    expect(VERSIONS.get("👟")).toBe(0.6);
    expect(VERSIONS.get("🍽")).toBe(0.7);
    expect(VERSIONS.get("🛝")).toBe(14);
    expect(VERSIONS.get("🪈")).toBe(15);
  });

  it("every fallback table icon is Emoji 13.0 or older", () => {
    const icons = FALLBACK_ICON_TABLE.map((entry) => entry.icon);
    expect(icons.length).toBeGreaterThan(40);
    expect(tooNew(icons.join(" "))).toEqual([]);
    // Every table icon is recognised as exactly one emoji, so the check above is real.
    for (const icon of icons) {
      expect(isEmojiGrapheme(icon)).toBe(true);
    }
  });

  it("default icons and default countdown emoji are Emoji 13.0 or older", () => {
    expect(tooNew(DEFAULT_EVENT_ICON)).toEqual([]);
    expect(tooNew(DEFAULT_MEAL_ICON)).toEqual([]);
    expect(DEFAULT_COUNTDOWN_EMOJIS.length).toBeGreaterThan(0);
    expect(tooNew(DEFAULT_COUNTDOWN_EMOJIS.join(" "))).toEqual([]);
  });

  it("no keyword maps to the bring bag 🎒", () => {
    expect(FALLBACK_ICON_TABLE.some((entry) => entry.icon === "🎒")).toBe(
      false,
    );
  });

  it("fails for table data with newer emoji (negative case)", () => {
    const tableWithNewEmoji = [
      ...FALLBACK_ICON_TABLE,
      { icon: "🪈", keywords: ["flöte"] },
    ];
    expect(
      tooNew(tableWithNewEmoji.map((entry) => entry.icon).join(" ")),
    ).toEqual(["🪈"]);
    expect(tooNew("🛝")).toEqual(["🛝"]);
    expect(tooNew("🎠")).toEqual([]);
  });
});
