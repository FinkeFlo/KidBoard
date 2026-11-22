import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import de from "../i18n/locales/de.json";
import en from "../i18n/locales/en.json";
import { ConnectedStatusBanner, StatusBanner } from "./StatusBanner";

const hooks = vi.hoisted(() => ({
  status: vi.fn(),
  kind: vi.fn(),
}));
vi.mock("../data", () => ({
  useConnectionStatus: hooks.status,
  useApiErrorKind: hooks.kind,
}));

describe("StatusBanner", () => {
  it.each(["loading", "ready"] as const)("is silent while %s", (status) => {
    const { container } = render(<StatusBanner status={status} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("announces offline politely", () => {
    render(<StatusBanner status="offline" />);
    expect(screen.getByRole("status")).toHaveTextContent(en.status.offline);
  });

  it("announces stale politely", () => {
    render(<StatusBanner status="stale" />);
    expect(screen.getByRole("status")).toHaveTextContent(en.status.stale);
  });

  it("raises an alert for a generic error", () => {
    render(<StatusBanner status="error" errorKind="server" />);
    expect(screen.getByRole("alert")).toHaveTextContent(en.status.error);
  });

  it.each(["error", "stale", "offline"] as const)(
    "tells an expired access link apart (%s)",
    (status) => {
      render(<StatusBanner status={status} errorKind="unauthorized" />);
      const alert = screen.getByRole("alert");
      expect(alert).toHaveTextContent(en.status.unauthorized);
      expect(alert).toHaveTextContent("?key=");
      expect(alert).toHaveAttribute("data-status", "unauthorized");
    },
  );

  it("has the unauthorized message in German too", () => {
    expect(de.status.unauthorized).toContain("?key=");
    expect(de.status.unauthorized).not.toBe(en.status.unauthorized);
  });
});

describe("ConnectedStatusBanner", () => {
  beforeEach(() => {
    hooks.status.mockReset();
    hooks.kind.mockReset();
  });

  it("reads status and error kind from the data layer", () => {
    hooks.status.mockReturnValue("error");
    hooks.kind.mockReturnValue("unauthorized");
    render(<ConnectedStatusBanner />);
    expect(screen.getByRole("alert")).toHaveTextContent(en.status.unauthorized);
  });
});
