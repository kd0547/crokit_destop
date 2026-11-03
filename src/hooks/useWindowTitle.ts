import { useEffect } from "react";
import { useSessionStore } from "@/state/sessionStore";
import { useLocale, t } from "@/i18n";

export function useWindowTitle() {
  const snapshot = useSessionStore((s) => s.snapshot);
  const locale = useLocale();

  useEffect(() => {
    const title =
      snapshot.state !== "idle"
        ? `${snapshot.folderName} — ${snapshot.shownCount}${snapshot.totalCount ? " / " + snapshot.totalCount : ""} — ${t("app.name")}`
        : t("app.name");
    window.crokit.window.setTitle(title);
  }, [snapshot.state, snapshot.folderName, snapshot.shownCount, snapshot.totalCount, locale]);
}
