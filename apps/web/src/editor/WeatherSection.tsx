import type {
  ParentWeatherResponse,
  TemperatureUnit,
  WeatherSetting,
} from "@kidboard/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";

import type { ApiClient } from "../data";
import { queryKeys } from "../data/queryKeys";
import { type EditorFailure, toFailure } from "./failure";
import { TID } from "./testIds";
import { ChoiceChip, EditorButton, FOCUS_RING } from "./ui";

/** The form's draft; `country` is kept as typed (in capitals). */
interface Draft {
  on: boolean;
  place: string;
  country: string;
  unit: TemperatureUnit;
}

type FieldError = "place" | "country";

/** Failures the section words itself (the entry-form texts would not fit). */
type WeatherFailureText =
  | "offline"
  | "timeout"
  | "unauthorized"
  | "locked"
  | "storage"
  | "invalid"
  | "failed";

function failureText(kind: EditorFailure["kind"]): WeatherFailureText {
  switch (kind) {
    case "offline":
    case "timeout":
    case "unauthorized":
    case "locked":
    case "storage":
    case "invalid":
      return kind;
    default:
      return "failed";
  }
}

const UNITS: readonly TemperatureUnit[] = ["celsius", "fahrenheit"];

const INPUT_CLASS = `min-h-touch-parent rounded-pill bg-surface text-text inset-ring-border text-body min-w-0 px-4 inset-ring-2 disabled:text-text-muted ${FOCUS_RING}`;

function draftOf(response: ParentWeatherResponse): Draft {
  return {
    on: response.weather !== null,
    place: response.weather?.place ?? "",
    country: response.weather?.country ?? "",
    unit: response.weather?.unit ?? "celsius",
  };
}

/** The setting the draft stands for, or the field that is not valid. */
function settingOf(
  draft: Draft,
): { ok: true; setting: WeatherSetting } | { ok: false; field: FieldError } {
  if (!draft.on) {
    return { ok: true, setting: { off: true } };
  }
  const place = draft.place.trim();
  if (place === "") {
    return { ok: false, field: "place" };
  }
  const country = draft.country.trim();
  if (country !== "" && !/^[A-Z]{2}$/.test(country)) {
    return { ok: false, field: "country" };
  }
  return {
    ok: true,
    setting: {
      place,
      ...(country === "" ? {} : { country }),
      unit: draft.unit,
    },
  };
}

type Action = { kind: "save"; setting: WeatherSetting } | { kind: "reset" };

/**
 * "Weather" (T-56, ADR-0016): parents turn the board's weather on with a town (optional
 * country, °C/°F), off, or back to the configuration's setting. The answer of the
 * worker says whether the town was found, as text. The town is personal data: it is
 * requested with the parent session on every mount (no TanStack query, so it is never
 * persisted) and kept in component state only. Mount it with `key={token}`. After a
 * save or reset the board refetches its config and then its weather.
 */
export function WeatherSection({
  api,
  token,
  onUnlock,
}: {
  api: ApiClient;
  token: string;
  /** For a locked session: show the PIN pad again. */
  onUnlock: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const ids = {
    switchLabel: useId(),
    place: useId(),
    placeError: useId(),
    country: useId(),
    countryHint: useId(),
    countryError: useId(),
    unit: useId(),
  };
  const [current, setCurrent] = useState<ParentWeatherResponse | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loadFailure, setLoadFailure] = useState<EditorFailure | null>(null);
  const [fieldError, setFieldError] = useState<FieldError | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    api.getParentWeather(token, controller.signal).then(
      (response) => {
        if (controller.signal.aborted) return;
        setCurrent(response);
        setDraft(draftOf(response));
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        setLoadFailure(toFailure(error));
      },
    );
    return () => {
      controller.abort();
    };
  }, [api, token, attempt]);

  const mutation = useMutation({
    mutationFn: (action: Action) =>
      action.kind === "save"
        ? api.saveParentWeather(token, action.setting)
        : api.resetParentWeather(token),
    onSuccess: async (response) => {
      setCurrent(response);
      setDraft(draftOf(response));
      // The config first (it switches the board's weather query on or off), then the
      // forecast for the new town; returned, so the mutation stays pending until both
      // are refetched.
      await queryClient.invalidateQueries({ queryKey: queryKeys.config() });
      await queryClient.invalidateQueries({ queryKey: queryKeys.weather() });
    },
  });

  const failure: EditorFailure | null =
    mutation.error === null ? loadFailure : toFailure(mutation.error);
  const busy = mutation.isPending;

  const update = (patch: Partial<Draft>): void => {
    setDraft((previous) =>
      previous === null ? previous : { ...previous, ...patch },
    );
    setFieldError(null);
  };

  const save = (): void => {
    if (draft === null) return;
    const result = settingOf(draft);
    if (!result.ok) {
      setFieldError(result.field);
      document.getElementById(ids[result.field])?.focus();
      return;
    }
    mutation.mutate({ kind: "save", setting: result.setting });
  };

  const coordinates = current?.weather?.coordinates === true;

  return (
    <section
      aria-labelledby="editor-weather"
      className="bg-surface-sunken rounded-column flex flex-col gap-4 p-4"
      data-testid={TID.weatherSection}
    >
      <h3 id="editor-weather" className="text-title">
        {t("editor.weather.title")}
      </h3>
      <p className="text-meta text-text-muted">{t("editor.weather.hint")}</p>
      {draft === null && failure === null && (
        <p className="text-body text-text-muted">
          {t("editor.weather.loading")}
        </p>
      )}
      {draft !== null && current !== null && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              role="switch"
              aria-checked={draft.on}
              aria-labelledby={ids.switchLabel}
              disabled={busy}
              data-testid={TID.weatherSwitch}
              onClick={() => {
                update({ on: !draft.on });
              }}
              className={`min-h-touch-parent rounded-pill inline-flex w-24 items-center px-1.5 inset-ring-2 ${draft.on ? "bg-accent inset-ring-accent justify-end" : "bg-surface inset-ring-border justify-start"} ${FOCUS_RING}`}
            >
              <span
                aria-hidden="true"
                className={`rounded-pill size-9 ${draft.on ? "bg-on-accent" : "bg-text-muted"}`}
              />
            </button>
            <span id={ids.switchLabel} className="text-body font-extrabold">
              {t("editor.weather.switch")}
            </span>
            <span className="text-body text-text-muted" aria-hidden="true">
              {t(draft.on ? "editor.weather.on" : "editor.weather.off")}
            </span>
          </div>
          {draft.on && (
            <div className="flex flex-col gap-4">
              {coordinates && draft.place === "" && (
                <p className="text-meta text-text-muted">
                  {t("editor.weather.coordinates")}
                </p>
              )}
              <div className="flex flex-wrap items-start gap-4">
                <div className="flex min-w-0 flex-[2_1_16rem] flex-col gap-2">
                  <label htmlFor={ids.place} className="text-body font-bold">
                    {t("editor.weather.place")}
                  </label>
                  <input
                    id={ids.place}
                    type="text"
                    value={draft.place}
                    maxLength={80}
                    autoComplete="off"
                    disabled={busy}
                    aria-invalid={fieldError === "place" ? true : undefined}
                    aria-describedby={
                      fieldError === "place" ? ids.placeError : undefined
                    }
                    onChange={(event) => {
                      update({ place: event.target.value });
                    }}
                    className={INPUT_CLASS}
                    data-testid={TID.weatherPlace}
                  />
                  {fieldError === "place" && (
                    <p id={ids.placeError} className="text-body text-danger">
                      {t("editor.weather.fieldError.place")}
                    </p>
                  )}
                </div>
                <div className="flex min-w-0 flex-[1_1_10rem] flex-col gap-2">
                  <label htmlFor={ids.country} className="text-body font-bold">
                    {t("editor.weather.country")}
                  </label>
                  <input
                    id={ids.country}
                    type="text"
                    value={draft.country}
                    maxLength={2}
                    autoComplete="off"
                    autoCapitalize="characters"
                    spellCheck={false}
                    disabled={busy}
                    aria-invalid={fieldError === "country" ? true : undefined}
                    aria-describedby={
                      fieldError === "country"
                        ? `${ids.countryHint} ${ids.countryError}`
                        : ids.countryHint
                    }
                    onChange={(event) => {
                      update({ country: event.target.value.toUpperCase() });
                    }}
                    className={INPUT_CLASS}
                    data-testid={TID.weatherCountry}
                  />
                  <p id={ids.countryHint} className="text-meta text-text-muted">
                    {t("editor.weather.countryHint")}
                  </p>
                  {fieldError === "country" && (
                    <p id={ids.countryError} className="text-body text-danger">
                      {t("editor.weather.fieldError.country")}
                    </p>
                  )}
                </div>
              </div>
              <div
                role="radiogroup"
                aria-labelledby={ids.unit}
                className="flex flex-wrap items-center gap-3"
              >
                <span id={ids.unit} className="text-body font-bold">
                  {t("editor.weather.unit")}
                </span>
                {UNITS.map((unit) => (
                  <ChoiceChip
                    key={unit}
                    type="radio"
                    name={ids.unit}
                    checked={draft.unit === unit}
                    disabled={busy}
                    onChange={() => {
                      update({ unit });
                    }}
                    data-testid={`${TID.weatherUnit}-${unit}`}
                  >
                    {t(`editor.weather.${unit}`)}
                  </ChoiceChip>
                ))}
              </div>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <EditorButton
              tone="primary"
              disabled={busy}
              aria-busy={busy}
              onClick={save}
              data-testid={TID.weatherSave}
            >
              {t(busy ? "editor.weather.saving" : "editor.weather.save")}
            </EditorButton>
            {current.source === "editor" && (
              <EditorButton
                disabled={busy}
                onClick={() => {
                  setFieldError(null);
                  mutation.mutate({ kind: "reset" });
                }}
                data-testid={TID.weatherReset}
              >
                {t("editor.weather.reset")}
              </EditorButton>
            )}
          </div>
        </>
      )}
      {/* A polite live region without the `status` role: the editor's toast is the one status. */}
      <div
        aria-live="polite"
        className="text-body flex flex-col gap-1 empty:hidden"
        data-testid={TID.weatherStatus}
        data-status={current?.status}
        data-source={current?.source}
      >
        {current !== null && !busy && (
          <>
            <p className="font-extrabold">
              {t(`editor.weather.status.${current.status}`)}
            </p>
            <p className="text-meta text-text-muted">
              {t(`editor.weather.source.${current.source}`)}
            </p>
          </>
        )}
      </div>
      {failure !== null && (
        <div
          role="alert"
          className="bg-notice text-on-notice rounded-tile flex flex-wrap items-center gap-3 px-4 py-3"
          data-testid={TID.weatherFailure}
          data-failure={failure.kind}
        >
          <p className="text-body min-w-0 flex-1 basis-48 font-bold">
            {t(`editor.weather.error.${failureText(failure.kind)}`)}{" "}
            <span className="text-caption whitespace-nowrap">
              {t("error.code", { code: failure.code })}
            </span>
          </p>
          {failure.kind === "locked" ? (
            <EditorButton tone="primary" onClick={onUnlock}>
              {t("editor.action.unlockAgain")}
            </EditorButton>
          ) : (
            draft === null && (
              <EditorButton
                onClick={() => {
                  setLoadFailure(null);
                  setAttempt((n) => n + 1);
                }}
              >
                {t("editor.action.retry")}
              </EditorButton>
            )
          )}
        </div>
      )}
    </section>
  );
}
