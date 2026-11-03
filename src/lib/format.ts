import { currentLocale, t } from "@/i18n";

export function durLabel(totalSeconds: number): string {
  const hh = Math.floor(totalSeconds / 3600);
  const mm = Math.floor((totalSeconds % 3600) / 60);
  const ss = totalSeconds % 60;
  const parts = [hh && t("dur.hours", hh), mm && t("dur.minutes", mm), ss && t("dur.seconds", ss)].filter(Boolean);
  return parts.length > 0 ? parts.join(t("dur.separator")) : t("dur.seconds", 0);
}

export function fmtClock(totalSeconds: number): string {
  const hh = Math.floor(totalSeconds / 3600);
  const mm = Math.floor((totalSeconds % 3600) / 60);
  const ss = totalSeconds % 60;
  const pad = (x: number) => String(x).padStart(2, "0");
  return hh ? `${hh}:${pad(mm)}:${pad(ss)}` : `${mm}:${pad(ss)}`;
}

export function formatDateLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const dayMs = 86400000;
  const diff = Math.floor((new Date(now.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / dayMs);
  if (diff === 0) return t("date.today");
  if (diff === 1) return t("date.yesterday");
  return d.toLocaleDateString(currentLocale(), { month: "long", day: "numeric" });
}

export function formatTimeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString(currentLocale(), { hour: "numeric", minute: "2-digit" });
}
