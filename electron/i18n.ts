import { app } from "electron";

/**
 * The few strings the main process shows itself. These can appear before the
 * backend (and so the saved language setting) is available, so they follow
 * the OS language. The renderer has its own dictionaries in src/i18n.
 */
type Locale = "ko" | "en" | "ja" | "zh-CN";

const MESSAGES = {
  backendFailedTitle: {
    ko: "crokit - 백엔드 시작 실패",
    en: "crokit - Backend failed to start",
    ja: "crokit - バックエンドを起動できません",
    "zh-CN": "crokit - 后台启动失败",
  },
  // packaged app: the usual cause is antivirus blocking the bundled backend exe
  backendFailedPackaged: {
    ko: "앱의 백엔드를 시작하지 못했습니다. 앱을 다시 실행해 보세요.\n문제가 계속되면 백신 프로그램이 crokit-backend.exe를 차단했는지 확인해 주세요.",
    en: "The app's backend could not be started. Please restart the app.\nIf this keeps happening, check whether your antivirus is blocking crokit-backend.exe.",
    ja: "アプリのバックエンドを起動できませんでした。アプリを再起動してください。\n問題が続く場合は、ウイルス対策ソフトが crokit-backend.exe をブロックしていないか確認してください。",
    "zh-CN": "无法启动应用后台。请重新启动应用。\n如果问题仍然存在，请检查杀毒软件是否拦截了 crokit-backend.exe。",
  },
  backendFailedDev: {
    ko: "Python 백엔드를 시작하지 못했습니다. `npm run python:setup`을 실행해 가상환경을 준비했는지 확인해 주세요.",
    en: "The Python backend could not be started. Make sure the virtual environment is set up with `npm run python:setup`.",
    ja: "Python バックエンドを起動できませんでした。`npm run python:setup` で仮想環境を準備したか確認してください。",
    "zh-CN": "无法启动 Python 后台。请确认已运行 `npm run python:setup` 准备虚拟环境。",
  },
} satisfies Record<string, Record<Locale, string>>;

function osLocale(): Locale {
  const l = app.getLocale().toLowerCase();
  if (l.startsWith("ko")) return "ko";
  if (l.startsWith("ja")) return "ja";
  if (l.startsWith("zh")) return "zh-CN";
  return "en";
}

export function mainT(key: keyof typeof MESSAGES): string {
  return MESSAGES[key][osLocale()];
}
