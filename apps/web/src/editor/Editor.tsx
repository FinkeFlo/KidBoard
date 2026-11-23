import {
  addCalendarDays,
  type EditorAppItem,
  type EditorEntryInput,
  type EditorEntryInputRaw,
  type EditorGoogleItem,
  type EditorTemplate,
  type EditorUnresolvedEntry,
  type ImportModeValue,
  isoWeekday,
  type PublicConfig,
} from "@kidboard/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";

import { Emoji } from "../components/Emoji";
import {
  type ApiClient,
  EditorApiError,
  type EditorScope,
  useConfig,
} from "../data";
import { useApiClient } from "../data/apiContext";
import { QUERY_ROOT } from "../data/queryKeys";
import { type FormatContext, useFormatContext } from "../i18n/format";
import { useParentGate } from "../parent/parentGate";
import { PinPad } from "../parent/PinPad";
import { useToday } from "../time";
import { activityById, type QuickPick } from "./catalogue";
import { type ChosenBackup, DataSection } from "./DataSection";
import {
  type EventDraft,
  eventDraftFromEntry,
  eventDraftFromGoogle,
  eventDraftFromTemplate,
  eventDraftToInput,
  type MealDraft,
  mealDraftFromEntry,
  mealDraftToInput,
  mealSeriesWeekdays,
  newEventDraft,
  newMealDraft,
  seriesStartDate,
} from "./draft";
import { EntryList } from "./EntryList";
import { EventForm } from "./EventForm";
import { type EditorFailure, STORAGE_FAILURE, toFailure } from "./failure";
import { dateLabel, dayLabel } from "./labels";
import { entriesOfBackup, planMealCopy } from "./mealCopy";
import { MealForm } from "./MealForm";
import { FailureNotice, Toast } from "./Notice";
import { TemplatesRow } from "./TemplatesRow";
import { TID } from "./testIds";
import { ConfirmDialog, EditorButton } from "./ui";
import { useEditorData } from "./useEditorData";

/** What an edit form changes: the stored entry and which of its days was opened. */
export interface EditTarget {
  entryId: string;
  revision: number;
  /** The stored entry (series master for series). */
  master: EditorEntryInput;
  /** Original date of the opened series occurrence; `null` for single entries. */
  occurrenceDate: string | null;
  /** The date the form showed when it opened. */
  shownDate: string;
  /** The opened series day had its own change ("only this day" override). */
  hasOverride: boolean;
}

type View =
  | { kind: "home" }
  | { kind: "event"; key: number; draft: EventDraft; target: EditTarget | null }
  | { kind: "meal"; key: number; draft: MealDraft; target: EditTarget | null };

type Pending =
  | {
      kind: "scope";
      title: string;
      date: string;
      hasOverride: boolean;
      save: (scope: EditorScope) => void;
    }
  | { kind: "delete"; title: string; target: EditTarget }
  | { kind: "copy"; plan: EditorEntryInputRaw[] };

type CopyState =
  | { kind: "nothing" }
  | { kind: "partial"; done: number; total: number; failure: EditorFailure };

const sortedDays = (days: readonly number[]): number[] =>
  [...new Set(days)].sort((a, b) => a - b);

/**
 * The series fields of `master` on a draft showing its day `occurrenceDate`. The rule
 * stays the stored one: a day moved on its own (another weekday) is anchored to its
 * rule day instead of adding its weekday (see `EventDraft.anchorDate`).
 */
function withSeries(
  draft: EventDraft,
  master: EditorEntryInput,
  occurrenceDate: string,
): EventDraft {
  const series = eventDraftFromEntry(master);
  const weekdays = sortedDays(series.weekdays);
  return {
    ...draft,
    repeat: series.repeat,
    interval: series.interval,
    until: series.until,
    weekdays,
    anchorDate: weekdays.includes(isoWeekday(draft.date))
      ? undefined
      : occurrenceDate,
  };
}

/** The form draft of one list item (the "only this day" replacement if it has one). */
export function draftOfItem(
  item: EditorAppItem,
): { kind: "event"; draft: EventDraft } | { kind: "meal"; draft: MealDraft } {
  const shown =
    item.override ??
    (item.occurrenceDate === null
      ? item.entry
      : { ...item.entry, date: item.occurrenceDate });
  if (item.kind === "meal") {
    return {
      kind: "meal",
      draft: { ...mealDraftFromEntry(shown), repeat: item.entry.repeat },
    };
  }
  const draft = eventDraftFromEntry(shown);
  return {
    kind: "event",
    draft:
      item.occurrenceDate === null
        ? draft
        : withSeries(draft, item.entry, item.occurrenceDate),
  };
}

function downloadText(fileName: string, text: string): void {
  const url = URL.createObjectURL(
    new Blob([text], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.rel = "noopener";
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);
}

/**
 * The parent editor (T-45) inside the unlocked {@link EditorScreen}: the home view
 * (actions, "Again" row, the 14-day list, the Data section) and the event and meal
 * forms. Every write refetches the board's agenda at once. Failures are calm notices
 * with a `KB-*` code; a failed save keeps the form. When the worker reports the session
 * as locked, the PIN pad opens above the form, which stays.
 */
export function Editor(): React.JSX.Element | null {
  const config = useConfig().data;
  const { session } = useParentGate();
  const today = useToday(config?.timeZone);
  const format = useFormatContext(config?.timeZone ?? "UTC");
  const api = useApiClient();
  if (config === undefined || today === undefined || session === null) {
    return null;
  }
  return (
    <EditorBody
      api={api}
      config={config}
      today={today}
      token={session.token}
      format={format}
    />
  );
}

interface BodyProps {
  api: ApiClient;
  config: PublicConfig;
  today: string;
  token: string;
  format: FormatContext;
}

function EditorBody({
  api,
  config,
  today,
  token,
  format,
}: BodyProps): React.JSX.Element {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const data = useEditorData(api, token, today);
  const [view, setView] = useState<View>({ kind: "home" });
  const [formKey, setFormKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<EditorFailure | null>(null);
  const [dataFailure, setDataFailure] = useState<EditorFailure | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [copy, setCopy] = useState<CopyState | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  // The session the PIN pad was asked for: a new unlock (new token) hides it.
  const [relockFor, setRelockFor] = useState<string | null>(null);
  const clearToast = useCallback(() => {
    setToast(null);
  }, []);

  const refreshBoard = (): void => {
    data.reload();
    void queryClient.invalidateQueries({ queryKey: [QUERY_ROOT, "agenda"] });
  };

  const open = (next: Exclude<View, { kind: "home" }>): void => {
    setFailure(null);
    setCopy(null);
    setView(next);
  };
  const nextKey = (): number => {
    const key = formKey + 1;
    setFormKey(key);
    return key;
  };
  const home = (): void => {
    setFailure(null);
    setCopy(null);
    setView({ kind: "home" });
  };

  /** Runs one write; success → home, toast, list and board refreshed. */
  const write = async (
    op: () => Promise<unknown>,
    message: string,
    purpose: "save" | "delete" = "save",
  ): Promise<boolean> => {
    setBusy(true);
    setFailure(null);
    try {
      await op();
      setView({ kind: "home" });
      setToast(message);
      refreshBoard();
      return true;
    } catch (error) {
      const classified = toFailure(error);
      const next: EditorFailure =
        classified.kind === "conflict" && purpose === "delete"
          ? { ...classified, kind: "conflictDelete" }
          : classified;
      setFailure(next);
      if (
        (next.kind === "conflict" || next.kind === "conflictDelete") &&
        error instanceof EditorApiError &&
        error.revision !== undefined
      ) {
        // Saving (or deleting) again acts on the newer version on purpose (the message
        // says so).
        const revision = error.revision;
        setView((current) =>
          current.kind !== "home" && current.target !== null
            ? { ...current, target: { ...current.target, revision } }
            : current,
        );
      }
      if (
        next.kind === "conflict" ||
        next.kind === "conflictDelete" ||
        next.kind === "notFound"
      ) {
        data.reload();
      }
      return false;
    } finally {
      setBusy(false);
    }
  };

  /**
   * Saves a series ("every week"). When the opened day had its own change, the worker
   * keeps it, so that day would not show the new entry: it then gets what the form
   * showed ("only this day", with the series' new revision). A failure there keeps the
   * form with the new revision, so saving again repeats both steps safely.
   */
  const saveSeries = (
    target: EditTarget,
    series: EditorEntryInputRaw,
    day: EditorEntryInputRaw,
  ): void => {
    void write(async () => {
      const result = await api.updateEntry(
        token,
        target.entryId,
        target.revision,
        series,
        { scope: "series" },
      );
      const saved = result.entry;
      const date = target.occurrenceDate;
      if (
        !target.hasOverride ||
        date === null ||
        saved === null ||
        saved.overrides[date] === undefined
      ) {
        return;
      }
      const revision = saved.revision;
      setView((current) =>
        current.kind !== "home" && current.target !== null
          ? { ...current, target: { ...current.target, revision } }
          : current,
      );
      refreshBoard();
      await api.updateEntry(token, target.entryId, revision, day, {
        scope: "one",
        date,
      });
    }, t("editor.toast.saved"));
  };

  const saveEvent = (draft: EventDraft, target: EditTarget | null): void => {
    if (target === null) {
      void write(
        () => api.createEntry(token, eventDraftToInput(draft)),
        t("editor.toast.saved"),
      );
      return;
    }
    const series = (scope: EditorScope): void => {
      if (scope.scope === "one") {
        const input = eventDraftToInput({ ...draft, repeat: "none" });
        void write(
          () =>
            api.updateEntry(
              token,
              target.entryId,
              target.revision,
              input,
              scope,
            ),
          t("editor.toast.saved"),
        );
        return;
      }
      const input = eventDraftToInput(
        draft.repeat === "none" || target.occurrenceDate === null
          ? draft
          : {
              ...draft,
              date: seriesStartDate(
                target.master,
                target.shownDate,
                draft,
                draft.weekdays,
              ),
            },
      );
      // The opened day as the form showed it (its series day when the date moved).
      const day = eventDraftToInput({
        ...draft,
        date:
          draft.date === target.shownDate
            ? draft.date
            : (target.occurrenceDate ?? draft.date),
        repeat: "none",
      });
      saveSeries(target, input, day);
    };
    if (target.occurrenceDate === null) {
      series({ scope: "series" });
      return;
    }
    const date = target.occurrenceDate;
    setPending({
      kind: "scope",
      title: draft.title,
      date,
      hasOverride: target.hasOverride,
      save: series,
    });
  };

  const saveMeal = (draft: MealDraft, target: EditTarget | null): void => {
    if (target === null) {
      void write(
        () => api.createEntry(token, mealDraftToInput(draft)),
        t("editor.toast.saved"),
      );
      return;
    }
    const save = (scope: EditorScope): void => {
      if (scope.scope === "one" || draft.repeat === "none") {
        const input = mealDraftToInput(
          scope.scope === "one" ? { ...draft, repeat: "none" } : draft,
        );
        void write(
          () =>
            api.updateEntry(
              token,
              target.entryId,
              target.revision,
              input,
              scope,
            ),
          t("editor.toast.saved"),
        );
        return;
      }
      const weekly = draft.repeat.weekly;
      const weekdays = mealSeriesWeekdays(
        weekly.weekdays,
        target.shownDate,
        draft.date,
      );
      const repeat = { weekly: { ...weekly, weekdays } };
      const input = mealDraftToInput({
        ...draft,
        repeat,
        date:
          target.occurrenceDate === null
            ? draft.date
            : seriesStartDate(target.master, target.shownDate, draft, weekdays),
      });
      const day = mealDraftToInput({
        ...draft,
        date:
          draft.date === target.shownDate
            ? draft.date
            : (target.occurrenceDate ?? draft.date),
        repeat: "none",
      });
      saveSeries(target, input, day);
    };
    if (target.occurrenceDate === null) {
      save({ scope: "series" });
      return;
    }
    const date = target.occurrenceDate;
    setPending({
      kind: "scope",
      title: draft.title,
      date,
      hasOverride: target.hasOverride,
      save,
    });
  };

  const remove = (target: EditTarget, scope: EditorScope): void => {
    void write(
      () => api.deleteEntry(token, target.entryId, target.revision, scope),
      t("editor.toast.deleted"),
      "delete",
    );
  };

  const editItem = (item: EditorAppItem): void => {
    const opened = draftOfItem(item);
    const target: EditTarget = {
      entryId: item.entryId,
      revision: item.revision,
      master: item.entry,
      occurrenceDate: item.occurrenceDate,
      shownDate: opened.draft.date,
      hasOverride: item.override !== null,
    };
    open(
      opened.kind === "event"
        ? { kind: "event", key: nextKey(), draft: opened.draft, target }
        : { kind: "meal", key: nextKey(), draft: opened.draft, target },
    );
  };

  const fixUnresolved = (entry: EditorUnresolvedEntry): void => {
    const target: EditTarget = {
      entryId: entry.entryId,
      revision: entry.revision,
      master: entry.entry,
      occurrenceDate: null,
      shownDate: entry.entry.date,
      hasOverride: false,
    };
    open(
      entry.entry.kind === "meal"
        ? {
            kind: "meal",
            key: nextKey(),
            draft: mealDraftFromEntry(entry.entry),
            target,
          }
        : {
            kind: "event",
            key: nextKey(),
            draft: eventDraftFromEntry(entry.entry),
            target,
          },
    );
  };

  const fromGoogle = (item: EditorGoogleItem): void => {
    if (item.kind === "meal") {
      open({
        kind: "meal",
        key: nextKey(),
        target: null,
        draft: {
          ...newMealDraft(
            item.date < today ? today : item.date,
            item.slot ?? "unspecified",
          ),
          icon: item.iconIsFallback ? "" : item.icon,
          title: item.title.slice(0, 60),
        },
      });
      return;
    }
    open({
      kind: "event",
      key: nextKey(),
      target: null,
      draft: eventDraftFromGoogle(item, today),
    });
  };

  const fromTemplate = (template: EditorTemplate): void => {
    if (template.kind === "meal") {
      open({
        kind: "meal",
        key: nextKey(),
        target: null,
        draft: {
          ...newMealDraft(today, template.slot ?? "unspecified"),
          icon: template.icon,
          title: template.title,
        },
      });
      return;
    }
    open({
      kind: "event",
      key: nextKey(),
      target: null,
      draft: eventDraftFromTemplate(template, today),
    });
  };

  const fromQuickPick = (pick: QuickPick): void => {
    const activity = activityById(pick.activity);
    const base = newEventDraft(today);
    open({
      kind: "event",
      key: nextKey(),
      target: null,
      draft: {
        ...base,
        icon: activity.icon,
        title: t(`editor.activity.${activity.id}`),
        titleFromLabel: true,
        allDay: pick.time === null,
        startTime: pick.time ?? base.startTime,
        repeat: pick.weekly ? "weekly" : "none",
        countdown: pick.countdown,
      },
    });
  };

  const exportBackup = async (): Promise<void> => {
    setBusy(true);
    setDataFailure(null);
    try {
      const backup = await api.exportEntries(token);
      downloadText(backup.fileName, backup.text);
      setToast(t("editor.toast.exported"));
    } catch (error) {
      setDataFailure(toFailure(error));
    } finally {
      setBusy(false);
    }
  };

  const importBackup = async (
    backup: ChosenBackup,
    mode: ImportModeValue,
  ): Promise<boolean> => {
    setBusy(true);
    setDataFailure(null);
    try {
      const result = await api.importEntries(token, mode, backup.text);
      setToast(t("editor.toast.imported", { count: result.imported }));
      refreshBoard();
      return true;
    } catch (error) {
      setDataFailure(toFailure(error));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const prepareCopy = async (): Promise<void> => {
    setBusy(true);
    setCopy(null);
    setFailure(null);
    try {
      const backup = await api.exportEntries(token);
      const planned = (data.list?.items ?? []).filter(
        (item) => item.kind === "meal",
      );
      const plan = planMealCopy(entriesOfBackup(backup.text), today, planned);
      if (plan.length === 0) setCopy({ kind: "nothing" });
      else setPending({ kind: "copy", plan });
    } catch (error) {
      setFailure(toFailure(error));
    } finally {
      setBusy(false);
    }
  };

  const runCopy = async (
    plan: readonly EditorEntryInputRaw[],
  ): Promise<void> => {
    setBusy(true);
    let done = 0;
    let failed: EditorFailure | null = null;
    for (const meal of plan) {
      try {
        await api.createEntry(token, meal);
        done += 1;
      } catch (error) {
        failed = toFailure(error);
        // Without connection or session the rest would fail the same way.
        if (
          ["offline", "timeout", "locked", "unauthorized"].includes(failed.kind)
        ) {
          break;
        }
      }
    }
    setBusy(false);
    if (done > 0) refreshBoard();
    if (failed === null) {
      setView({ kind: "home" });
      setToast(t("editor.toast.copied", { count: done }));
    } else {
      setCopy({ kind: "partial", done, total: plan.length, failure: failed });
    }
  };

  const shell = {
    config,
    today,
    format,
    busy,
    failure,
    onCancel: home,
    onUnlock: () => {
      setRelockFor(token);
    },
  };

  const listFailure = data.failure;
  let content: React.JSX.Element;
  if (view.kind === "event") {
    const target = view.target;
    content = (
      <EventForm
        key={view.key}
        {...shell}
        heading={t(
          target === null ? "editor.form.newTitle" : "editor.form.editTitle",
        )}
        initial={view.draft}
        onSubmit={(draft) => {
          saveEvent(draft, target);
        }}
        onDelete={
          target === null
            ? undefined
            : () => {
                setPending({
                  kind: "delete",
                  title: target.master.title,
                  target,
                });
              }
        }
      />
    );
  } else if (view.kind === "meal") {
    const target = view.target;
    content = (
      <MealForm
        key={view.key}
        {...shell}
        heading={t(
          target === null ? "editor.meal.newTitle" : "editor.meal.editTitle",
        )}
        initial={view.draft}
        onSubmit={(draft) => {
          saveMeal(draft, target);
        }}
        onDelete={
          target === null
            ? undefined
            : () => {
                setPending({
                  kind: "delete",
                  title: target.master.title,
                  target,
                });
              }
        }
        copyAction={
          target === null ? (
            <section
              aria-labelledby="editor-copy"
              className="bg-surface-sunken rounded-column flex flex-col gap-3 p-4"
              data-testid={TID.copyMeals}
            >
              <h4 id="editor-copy" className="text-body font-extrabold">
                {t("editor.copy.title")}
              </h4>
              <p className="text-meta text-text-muted">
                {t("editor.copy.hint")}
              </p>
              <EditorButton
                className="self-start"
                disabled={busy}
                onClick={() => {
                  void prepareCopy();
                }}
                data-testid={TID.copyMealsStart}
              >
                <Emoji emoji="🔁" className="text-[1.5rem]" />
                {t("editor.copy.action")}
              </EditorButton>
              {copy?.kind === "nothing" && (
                <p role="status" className="text-body">
                  {t("editor.copy.nothing")}
                </p>
              )}
              {copy?.kind === "partial" && (
                <div
                  className="flex flex-col gap-2"
                  data-testid={TID.copyPartial}
                >
                  <p role="status" className="text-body">
                    {t("editor.copy.partial", {
                      done: copy.done,
                      count: copy.total,
                    })}
                  </p>
                  <FailureNotice
                    failure={copy.failure}
                    onUnlock={() => {
                      setRelockFor(token);
                    }}
                  />
                </div>
              )}
            </section>
          ) : undefined
        }
      />
    );
  } else {
    content = (
      <div
        className="flex h-full min-h-0 flex-col gap-8 overflow-y-auto pe-2 pb-8"
        data-testid={TID.editorHome}
      >
        <div className="flex flex-wrap gap-3">
          <EditorButton
            tone="primary"
            className="text-title"
            data-testid={TID.newEntry}
            onClick={() => {
              open({
                kind: "event",
                key: nextKey(),
                target: null,
                draft: newEventDraft(today),
              });
            }}
          >
            <Emoji emoji="➕" className="text-[1.5rem]" />
            {t("editor.home.newEntry")}
          </EditorButton>
          <EditorButton
            className="text-title"
            data-testid={TID.newMeal}
            onClick={() => {
              open({
                kind: "meal",
                key: nextKey(),
                target: null,
                draft: newMealDraft(today, "dinner"),
              });
            }}
          >
            <Emoji emoji="🍽️" className="text-[1.5rem]" />
            {t("editor.home.newMeal")}
          </EditorButton>
        </div>
        <TemplatesRow
          templates={data.templates}
          childList={config.children}
          onTemplate={fromTemplate}
          onQuickPick={fromQuickPick}
        />
        <section aria-labelledby="editor-list" className="flex flex-col gap-4">
          <h3 id="editor-list" className="text-heading">
            {t("editor.list.title")}
          </h3>
          {listFailure !== null && (
            <FailureNotice
              failure={listFailure}
              onRetry={data.reload}
              onUnlock={() => {
                setRelockFor(token);
              }}
            />
          )}
          {data.list?.storageUnavailable === true && (
            <FailureNotice
              failure={STORAGE_FAILURE}
              onRetry={data.reload}
              data-testid={TID.storageUnavailable}
            />
          )}
          {data.list === null ? (
            listFailure === null && (
              <p className="text-body text-text-muted" role="status">
                {t("editor.list.loading")}
              </p>
            )
          ) : (
            <EntryList
              data={data.list}
              config={config}
              today={today}
              format={format}
              onEdit={editItem}
              onTemplate={fromGoogle}
              onFix={fixUnresolved}
              onDeleteUnresolved={(entry) => {
                setPending({
                  kind: "delete",
                  title: entry.entry.title,
                  target: {
                    entryId: entry.entryId,
                    revision: entry.revision,
                    master: entry.entry,
                    occurrenceDate: null,
                    shownDate: entry.entry.date,
                    hasOverride: false,
                  },
                });
              }}
            />
          )}
        </section>
        {failure !== null && <FailureNotice failure={failure} />}
        <DataSection
          busy={busy}
          failure={dataFailure}
          onExport={() => {
            void exportBackup();
          }}
          onImport={importBackup}
        />
      </div>
    );
  }

  return (
    <div className="h-full min-h-0" data-testid={TID.editor}>
      {content}
      {pending?.kind === "scope" && (
        <ConfirmDialog
          title={t("editor.scope.title", { title: pending.title })}
          text={
            pending.hasOverride
              ? `${t("editor.scope.text")} ${t("editor.scope.overrideText")}`
              : t("editor.scope.text")
          }
          cancelLabel={t("editor.action.cancel")}
          onCancel={() => {
            setPending(null);
          }}
          actions={[
            {
              label: t("editor.scope.one", {
                day: dateLabel(pending.date, format, t),
              }),
              "data-testid": TID.scopeOne,
              onSelect: () => {
                setPending(null);
                pending.save({ scope: "one", date: pending.date });
              },
            },
            {
              label: t("editor.scope.series"),
              "data-testid": TID.scopeSeries,
              onSelect: () => {
                setPending(null);
                pending.save({ scope: "series" });
              },
            },
          ]}
        />
      )}
      {pending?.kind === "delete" && (
        <ConfirmDialog
          title={t("editor.delete.title", { title: pending.title })}
          text={
            pending.target.occurrenceDate === null
              ? t("editor.delete.text")
              : t("editor.delete.seriesText")
          }
          cancelLabel={t("editor.delete.keep")}
          onCancel={() => {
            setPending(null);
          }}
          actions={
            pending.target.occurrenceDate === null
              ? [
                  {
                    label: t("editor.action.delete"),
                    tone: "primary",
                    "data-testid": TID.confirmDelete,
                    onSelect: () => {
                      setPending(null);
                      remove(pending.target, { scope: "series" });
                    },
                  },
                ]
              : [
                  {
                    label: t("editor.scope.one", {
                      day: dateLabel(pending.target.occurrenceDate, format, t),
                    }),
                    "data-testid": TID.deleteOne,
                    onSelect: () => {
                      const date = pending.target.occurrenceDate ?? today;
                      setPending(null);
                      remove(pending.target, { scope: "one", date });
                    },
                  },
                  {
                    label: t("editor.scope.series"),
                    "data-testid": TID.deleteSeries,
                    onSelect: () => {
                      setPending(null);
                      remove(pending.target, { scope: "series" });
                    },
                  },
                ]
          }
        />
      )}
      {pending?.kind === "copy" && (
        <ConfirmDialog
          title={t("editor.copy.confirmTitle", { count: pending.plan.length })}
          text={t("editor.copy.confirmText", {
            from: dayLabel(today, today, format, t),
            to: dayLabel(addCalendarDays(today, 6), today, format, t),
          })}
          cancelLabel={t("editor.action.cancel")}
          onCancel={() => {
            setPending(null);
          }}
          actions={[
            {
              label: t("editor.copy.confirmAction"),
              tone: "primary",
              "data-testid": TID.confirmCopy,
              onSelect: () => {
                const plan = pending.plan;
                setPending(null);
                void runCopy(plan);
              },
            },
          ]}
        />
      )}
      <Toast message={toast} onDone={clearToast} />
      {relockFor === token && <PinPad />}
    </div>
  );
}
