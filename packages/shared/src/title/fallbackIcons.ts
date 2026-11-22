export const DEFAULT_EVENT_ICON = "📅";
export const DEFAULT_MEAL_ICON = "🍽️";

/** Keyword table entry: whole-word, case-insensitive, umlaut-aware (DE + EN). */
interface FallbackEntry {
  readonly icon: string;
  readonly keywords: readonly string[];
}

export const FALLBACK_ICON_TABLE: readonly FallbackEntry[] = [
  {
    icon: "🏫",
    keywords: [
      "kita",
      "kindergarten",
      "schule",
      "school",
      "daycare",
      "preschool",
      "hort",
    ],
  },
  { icon: "🎂", keywords: ["geburtstag", "kindergeburtstag", "birthday"] },
  {
    icon: "🩺",
    keywords: [
      "arzt",
      "ärztin",
      "kinderarzt",
      "doctor",
      "doktor",
      "pediatrician",
    ],
  },
  { icon: "🦷", keywords: ["zahnarzt", "zahnärztin", "dentist"] },
  { icon: "💉", keywords: ["impfung", "impfen", "vaccination"] },
  {
    icon: "💇",
    keywords: ["friseur", "haarschnitt", "haircut", "hairdresser"],
  },
  { icon: "⚽", keywords: ["fußball", "fussball", "football", "soccer"] },
  { icon: "🏊", keywords: ["schwimmen", "schwimmbad", "swimming", "pool"] },
  { icon: "🩰", keywords: ["ballett", "ballet"] },
  { icon: "🎹", keywords: ["klavier", "piano"] },
  { icon: "🎸", keywords: ["gitarre", "guitar"] },
  { icon: "🎵", keywords: ["musik", "music", "chor", "choir"] },
  { icon: "🤸", keywords: ["turnen", "gymnastics"] },
  { icon: "💃", keywords: ["tanzen", "tanz", "dance"] },
  { icon: "🥋", keywords: ["judo", "karate"] },
  { icon: "🏀", keywords: ["basketball"] },
  { icon: "🎾", keywords: ["tennis"] },
  { icon: "🐴", keywords: ["reiten", "riding"] },
  { icon: "🎬", keywords: ["kino", "cinema", "movie"] },
  { icon: "🛝", keywords: ["spielplatz", "playground"] },
  { icon: "🦁", keywords: ["zoo"] },
  { icon: "🛁", keywords: ["baden", "bad", "bath"] },
  {
    icon: "📚",
    keywords: ["hausaufgaben", "homework", "bibliothek", "library"],
  },
  { icon: "🏖️", keywords: ["urlaub", "vacation", "holiday", "ferien"] },
  { icon: "✈️", keywords: ["flug", "flight", "reise", "trip"] },
  { icon: "🎄", keywords: ["weihnachten", "christmas"] },
  { icon: "🐣", keywords: ["ostern", "easter"] },
  { icon: "🎉", keywords: ["party", "feier", "fest"] },
  { icon: "👵", keywords: ["oma", "grandma"] },
  { icon: "👴", keywords: ["opa", "grandpa"] },
  // Food
  { icon: "🍕", keywords: ["pizza"] },
  { icon: "🍝", keywords: ["spaghetti", "nudeln", "pasta"] },
  { icon: "🍲", keywords: ["suppe", "eintopf", "soup", "stew"] },
  { icon: "🥗", keywords: ["salat", "salad"] },
  { icon: "🍔", keywords: ["burger", "hamburger"] },
  { icon: "🍟", keywords: ["pommes", "fries"] },
  { icon: "🌭", keywords: ["wurst", "würstchen", "sausage", "hotdog"] },
  { icon: "🍚", keywords: ["reis", "rice"] },
  { icon: "🐟", keywords: ["fisch", "fish"] },
  { icon: "🍗", keywords: ["hähnchen", "hühnchen", "chicken"] },
  { icon: "🥔", keywords: ["kartoffeln", "kartoffel", "potatoes", "potato"] },
  {
    icon: "🥣",
    keywords: ["müsli", "muesli", "cereal", "porridge", "haferbrei"],
  },
  { icon: "🍞", keywords: ["brot", "bread"] },
  { icon: "🥞", keywords: ["pfannkuchen", "pancakes", "pancake"] },
  { icon: "🥚", keywords: ["ei", "eier", "rührei", "egg", "eggs"] },
  { icon: "🍰", keywords: ["kuchen", "cake"] },
  { icon: "🍦", keywords: ["eis", "ice cream"] },
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

const COMPILED = FALLBACK_ICON_TABLE.map((entry) => ({
  icon: entry.icon,
  pattern: new RegExp(
    `(?<![\\p{L}\\p{N}])(?:${entry.keywords.map(escapeRegExp).join("|")})(?![\\p{L}\\p{N}])`,
    "iu",
  ),
}));

/**
 * Looks up a fallback icon for `title` by whole-word keyword match (case-insensitive,
 * Unicode-aware). With several matches the one that appears first in the title wins
 * (ties: table order). Returns `undefined` if nothing matches.
 */
export function findFallbackIcon(title: string): string | undefined {
  let best: { icon: string; index: number } | undefined;
  for (const { icon, pattern } of COMPILED) {
    const index = pattern.exec(title)?.index;
    if (index !== undefined && (best === undefined || index < best.index)) {
      best = { icon, index };
    }
  }
  return best?.icon;
}
