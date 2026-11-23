import { type AppConfig, AppConfigSchema } from "../config";

/** Synthetic config shared by the editor tests (no real data). */
export function editorTestConfig(
  overrides: Partial<AppConfig> = {},
): AppConfig {
  return {
    ...AppConfigSchema.parse({
      locale: "de",
      timeZone: "Europe/Berlin",
      children: [
        { id: "mia", name: "Mia", color: "red", avatar: "🦊" },
        { id: "ben", name: "Ben", color: "blue", avatar: "🐻" },
        { id: "juergen", name: "Jürgen", color: "green", avatar: "🐸" },
        { id: "emile", name: "Émile", color: "teal", avatar: "🐧" },
        { id: "anna", name: "Anna-Lena", color: "pink", avatar: "🦄" },
      ],
      calendars: [
        { id: "kinder", kind: "events" },
        { id: "mia-cal", kind: "events", childId: "mia" },
        { id: "ben-cal", kind: "events", childId: "ben" },
        { id: "juergen-cal", kind: "events", childId: "juergen" },
        { id: "essen", kind: "meals" },
      ],
    }),
    ...overrides,
  };
}
