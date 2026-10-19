import type { AppUpdate } from "../appupdate.ts";
import { createRefreshGate, type DictStatus } from "../dict/dictstatus.ts";
import { escapeHtml } from "../htmlutil.ts";
import { runOfflineIndicator } from "../offline.ts";
import type { StatusPort } from "../ports.ts";
import type { SpellChecker } from "../spell/spellchecker.ts";
import type { DocStatus } from "./docstatus.ts";

const DICT_REFRESH_GAP_MS = 24 * 60 * 60 * 1000;
const DICT_REFRESH_POLL_MS = 3 * 60 * 60 * 1000;

export interface DictLifeDeps {
  readonly checker: SpellChecker;
  readonly dicts: DictStatus;
  readonly docStatus: DocStatus;
  readonly status: StatusPort;
  readonly appUpdate: AppUpdate;
  readonly blank: () => boolean;
  readonly recheckAll: () => Promise<void>;
}

export interface DictLife {
  readonly watchFatal: () => void;
  readonly start: () => Promise<void>;
  readonly setEnglish: (next: Set<string>) => void;
}

function failureText(error: unknown): string {
  return escapeHtml(error instanceof Error ? error.message : String(error));
}

export function createDictLife(deps: DictLifeDeps): DictLife {
  const { checker, dicts, docStatus, status, appUpdate } = deps;
  const refreshDue = createRefreshGate(DICT_REFRESH_GAP_MS);

  const maybeRefresh = (): void => {
    if (import.meta.env.DEV) return;
    if (!docStatus.ready() || !navigator.onLine) return;
    if (!refreshDue(Date.now())) return;
    checker.refresh();
    void appUpdate.checkFreshness();
  };

  const watchRefresh = (): void => {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") maybeRefresh();
    });
    window.addEventListener("online", () => maybeRefresh());
    setInterval(maybeRefresh, DICT_REFRESH_POLL_MS);
  };

  const indicateOffline = (): void => {
    void runOfflineIndicator({
      idle: deps.blank,
      setStatus: status.set,
      base: dicts.base,
      setActive: dicts.setIndicating,
    });
  };

  return {
    watchFatal() {
      checker.onFatal = async (reason) => {
        if (await appUpdate.recoverStale()) return;
        status.set(
          "Алдаа шалгагч зогслоо: " +
            escapeHtml(String(reason)) +
            " — хуудсыг дахин ачаална уу",
        );
      };
    },
    async start() {
      try {
        const { loaded, failed, fallbackReason, mnVersion } =
          await checker.init(import.meta.env.BASE_URL);
        docStatus.markReady();
        checker.setActive(dicts.active());
        appUpdate.setDictVersion(mnVersion);
        await deps.recheckAll();
        if (loaded.length) {
          dicts.loaded(loaded, failed, fallbackReason);
          indicateOffline();
        } else {
          status.set(
            "Нэг ч толь алга — <code>public/dict/</code> дотор .aff/.dic хийнэ үү.",
          );
        }
        checker.onDictUpdated = (id) => {
          if (id !== "mn_MN") return;
          appUpdate.setDictVersion(checker.mnVersion);
          void deps.recheckAll();
        };
        watchRefresh();
        void checker.whenComplete().then((done) => {
          dicts.completed(
            checker.loadedIds,
            [...(failed || []), ...done.failed],
            fallbackReason,
          );
          docStatus.showDictsIfIdle();
          void deps.recheckAll();
          maybeRefresh();
        });
      } catch (e) {
        if (await appUpdate.recoverStale()) return;
        status.set("Ачаалахад алдаа гарлаа: " + failureText(e));
      }
    },
    setEnglish(next) {
      dicts.setEnglish(next, checker.loadedIds);
      checker.setActive(dicts.active());
      void deps.recheckAll();
      docStatus.showDictsIfIdle();
    },
  };
}
