import {
  Causcape,
  LiveCollaborationTrigger,
  TTDDialogTrigger,
  CaptureUpdateAction,
  reconcileElements,
  useEditorInterface,
  CauscapeAPIProvider,
  useCauscapeAPI,
} from "@causcape/causcape";
import { trackEvent } from "@causcape/causcape/analytics";
import {
  clearAppStateForLocalStorage,
  getDefaultAppState,
} from "@causcape/causcape/appState";
import {
  CommandPalette,
  DEFAULT_CATEGORIES,
} from "@causcape/causcape/components/CommandPalette/CommandPalette";
import { ErrorDialog } from "@causcape/causcape/components/ErrorDialog";
import { OverwriteConfirmDialog } from "@causcape/causcape/components/OverwriteConfirm/OverwriteConfirm";
import { openConfirmModal } from "@causcape/causcape/components/OverwriteConfirm/OverwriteConfirmState";
import { ShareableLinkDialog } from "@causcape/causcape/components/ShareableLinkDialog";
import Trans from "@causcape/causcape/components/Trans";
import {
  APP_NAME,
  EVENT,
  VERSION_TIMEOUT,
  debounce,
  getVersion,
  getFrame,
  isTestEnv,
  preventUnload,
  resolvablePromise,
  isDevEnv,
  randomId,
  viewportCoordsToSceneCoords,
} from "@causcape/common";
import polyfill from "@causcape/causcape/polyfill";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { loadFromBlob } from "@causcape/causcape/data/blob";
import { t } from "@causcape/causcape/i18n";

import {
  GithubIcon,
  XBrandIcon,
  DiscordIcon,
  ExcalLogo,
  usersIcon,
  exportToPlus,
  share,
  youtubeIcon,
} from "@causcape/causcape/components/icons";
import { isElementLink } from "@causcape/element";
import {
  bumpElementVersions,
  restoreAppState,
  restoreElements,
} from "@causcape/causcape/data/restore";
import { newElementWith } from "@causcape/element";
import { isInitializedImageElement } from "@causcape/element";
import clsx from "clsx";
import {
  parseLibraryTokensFromUrl,
  useHandleLibrary,
} from "@causcape/causcape/data/library";

import {
  createProjectFromTemplate,
  transactProject,
  type CanvasObject,
  type CauscapeDocument,
  type MetadataValue,
  type Project,
  type ProjectTemplate,
} from "@causcape/core";

import type { RemoteCauscapeElement } from "@causcape/causcape/data/reconcile";
import type { RestoredDataState } from "@causcape/causcape/data/restore";
import type {
  FileId,
  NonDeletedCauscapeElement,
  OrderedCauscapeElement,
} from "@causcape/element/types";
import type {
  AppState,
  CauscapeImperativeAPI,
  BinaryFiles,
  CauscapeInitialDataState,
  UIAppState,
  CauscapeProps,
} from "@causcape/causcape/types";
import type { ResolutionType } from "@causcape/common/utility-types";
import type { ResolvablePromise } from "@causcape/common/utils";

import CustomStats from "./CustomStats";
import {
  Provider,
  useAtom,
  useAtomValue,
  useAtomWithInitialValue,
  appJotaiStore,
} from "./app-jotai";
import {
  FIREBASE_STORAGE_PREFIXES,
  isCauscapePlusSignedUser,
  STORAGE_KEYS,
  SYNC_BROWSER_TABS_TIMEOUT,
} from "./app_constants";
import Collab, {
  collabAPIAtom,
  isCollaboratingAtom,
  isOfflineAtom,
  userToFollowAtom,
} from "./collab/Collab";
import { AppFooter } from "./components/AppFooter";
import { AppMainMenu } from "./components/AppMainMenu";
import { AppWelcomeScreen } from "./components/AppWelcomeScreen";
import { CauscapeDocumentHeader } from "./components/CauscapeDocumentHeader";
import { CauscapeProjectActions } from "./components/CauscapeProjectActions";
import { GraphMCPBridge } from "./mcp/GraphMCPBridge";
import { ProjectMCPBridge } from "./mcp/ProjectMCPBridge";
import {
  ExportToCauscapePlus,
  exportToCauscapePlus,
} from "./components/ExportToCauscapePlus";
import { TopErrorBoundary } from "./components/TopErrorBoundary";

import {
  exportToBackend,
  getCollaborationLinkData,
  importFromBackend,
  isCollaborationLink,
} from "./data";

import { updateStaleImageStatuses } from "./data/FileManager";
import { FileStatusStore } from "./data/fileStatusStore";
import {
  importFromLocalStorage,
  importUsernameFromLocalStorage,
} from "./data/localStorage";

import { loadFilesFromFirebase } from "./data/firebase";
import {
  LibraryIndexedDBAdapter,
  LibraryLocalStorageMigrationAdapter,
  LocalData,
  localStorageQuotaExceededAtom,
} from "./data/LocalData";
import { isBrowserStorageStateNewer } from "./data/tabSync";
import { ShareDialog, shareDialogStateAtom } from "./share/ShareDialog";
import CollabError, { collabErrorIndicatorAtom } from "./collab/CollabError";
import { useHandleAppTheme } from "./useHandleAppTheme";
import { getPreferredLanguage } from "./app-language/language-detector";
import { useAppLangCode } from "./app-language/language-state";
import DebugCanvas, {
  debugRenderer,
  isVisualDebuggerEnabled,
  loadSavedDebugState,
} from "./components/DebugCanvas";
import { useSimulatedCollaborators } from "./debugCollaborators";
import { AIComponents } from "./components/AI";
import { CauscapePlusIframeExport } from "./CauscapePlusIframeExport";

import "./index.scss";

import { CauscapePlusPromoBanner } from "./components/CauscapePlusPromoBanner";
import { AppSidebar } from "./components/AppSidebar";
import { CauscapeProjectShell } from "./components/CauscapeProjectShell";
import { CauscapeProjectDashboard } from "./components/CauscapeProjectDashboard";
import { CauscapeEngineeringTools } from "./components/CauscapeEngineeringTools";
import {
  CauscapeFlowOverlay,
  type CauscapeFlowOverlayHandle,
} from "./components/CauscapeFlowOverlay";
import {
  CauscapeProjectRepository,
  downloadProjectFile,
  IndexedDbProjectDriver,
  type ProjectSummary,
} from "./data/CauscapeProjectRepository";
import {
  createPreparedEngineeringShape,
  deriveCanvasObjects,
  getSelectedCanvasObjectIds,
  PREPARED_ENGINEERING_SHAPES,
  type PreparedEngineeringShapeKind,
} from "./data/causcapeCanvasObjects";

import type { CollabAPI } from "./collab/Collab";

const CauscapeDocumentEditor = lazy(() =>
  import("./components/CauscapeDocumentEditor").then((module) => ({
    default: module.CauscapeDocumentEditor,
  })),
);

polyfill();

window.CAUSCAPE_THROTTLE_RENDER = true;

declare global {
  interface BeforeInstallPromptEventChoiceResult {
    outcome: "accepted" | "dismissed";
  }

  interface BeforeInstallPromptEvent extends Event {
    prompt(): Promise<void>;
    userChoice: Promise<BeforeInstallPromptEventChoiceResult>;
  }

  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent;
  }
}

let pwaEvent: BeforeInstallPromptEvent | null = null;

// Adding a listener outside of the component as it may (?) need to be
// subscribed early to catch the event.
//
// Also note that it will fire only if certain heuristics are met (user has
// used the app for some time, etc.)
window.addEventListener(
  "beforeinstallprompt",
  (event: BeforeInstallPromptEvent) => {
    // prevent Chrome <= 67 from automatically showing the prompt
    event.preventDefault();
    // cache for later use
    pwaEvent = event;
  },
);

let isSelfEmbedding = false;

if (window.self !== window.top) {
  try {
    const parentUrl = new URL(document.referrer);
    const currentUrl = new URL(window.location.href);
    if (parentUrl.origin === currentUrl.origin) {
      isSelfEmbedding = true;
    }
  } catch (error) {
    // ignore
  }
}

const shareableLinkConfirmDialog = {
  title: t("overwriteConfirm.modal.shareableLink.title"),
  description: (
    <Trans
      i18nKey="overwriteConfirm.modal.shareableLink.description"
      bold={(text) => <strong>{text}</strong>}
      br={() => <br />}
    />
  ),
  actionLabel: t("overwriteConfirm.modal.shareableLink.button"),
  color: "danger",
} as const;

const initializeScene = async (opts: {
  collabAPI: CollabAPI | null;
  causcapeAPI: CauscapeImperativeAPI;
}): Promise<
  { scene: CauscapeInitialDataState | null } & (
    | { isExternalScene: true; id: string; key: string }
    | { isExternalScene: false; id?: null; key?: null }
  )
> => {
  const searchParams = new URLSearchParams(window.location.search);
  const id = searchParams.get("id");
  const jsonBackendMatch = window.location.hash.match(
    /^#json=([a-zA-Z0-9_-]+),([a-zA-Z0-9_-]+)$/,
  );
  const externalUrlMatch = window.location.hash.match(/^#url=(.*)$/);

  const localDataState = importFromLocalStorage();

  let scene: Omit<
    RestoredDataState,
    // we're not storing files in the scene database/localStorage, and instead
    // fetch them async from a different store
    "files"
  > & {
    scrollToContent?: boolean;
  } = {
    elements: restoreElements(localDataState?.elements, null, {
      repairBindings: true,
      deleteInvisibleElements: true,
    }),
    appState: restoreAppState(localDataState?.appState, null),
  };

  let roomLinkData = getCollaborationLinkData(window.location.href);
  const isExternalScene = !!(id || jsonBackendMatch || roomLinkData);
  if (isExternalScene) {
    if (
      // don't prompt if scene is empty
      !scene.elements.length ||
      // don't prompt for collab scenes because we don't override local storage
      roomLinkData ||
      // otherwise, prompt whether user wants to override current scene
      (await openConfirmModal(shareableLinkConfirmDialog))
    ) {
      if (jsonBackendMatch) {
        const imported = await importFromBackend(
          jsonBackendMatch[1],
          jsonBackendMatch[2],
        );

        scene = {
          elements: bumpElementVersions(
            restoreElements(imported.elements, null, {
              repairBindings: true,
              deleteInvisibleElements: true,
            }),
            localDataState?.elements,
          ),
          appState: restoreAppState(
            imported.appState,
            // local appState when importing from backend to ensure we restore
            // localStorage user settings which we do not persist on server.
            localDataState?.appState,
          ),
        };
      }
      scene.scrollToContent = true;
      if (!roomLinkData) {
        window.history.replaceState({}, APP_NAME, window.location.origin);
      }
    } else {
      // https://github.com/causcape/causcape/issues/1919
      if (document.hidden) {
        return new Promise((resolve, reject) => {
          window.addEventListener(
            "focus",
            () => initializeScene(opts).then(resolve).catch(reject),
            {
              once: true,
            },
          );
        });
      }

      roomLinkData = null;
      window.history.replaceState({}, APP_NAME, window.location.origin);
    }
  } else if (externalUrlMatch) {
    window.history.replaceState({}, APP_NAME, window.location.origin);

    const url = externalUrlMatch[1];
    try {
      const request = await fetch(window.decodeURIComponent(url));
      const data = await loadFromBlob(await request.blob(), null, null);
      if (
        !scene.elements.length ||
        (await openConfirmModal(shareableLinkConfirmDialog))
      ) {
        return { scene: data, isExternalScene };
      }
    } catch (error: any) {
      return {
        scene: {
          appState: {
            errorMessage: t("alerts.invalidSceneUrl"),
          },
        },
        isExternalScene,
      };
    }
  }

  if (roomLinkData && opts.collabAPI) {
    const { causcapeAPI } = opts;

    const scene = await opts.collabAPI.startCollaboration(roomLinkData);

    return {
      // when collaborating, the state may have already been updated at this
      // point (we may have received updates from other clients), so reconcile
      // elements and appState with existing state
      scene: {
        ...scene,
        appState: {
          ...restoreAppState(
            {
              ...scene?.appState,
              theme: localDataState?.appState?.theme || scene?.appState?.theme,
            },
            causcapeAPI.getAppState(),
          ),
          // necessary if we're invoking from a hashchange handler which doesn't
          // go through App.initializeScene() that resets this flag
          isLoading: false,
        },
        elements: reconcileElements(
          scene?.elements || [],
          causcapeAPI.getSceneElementsIncludingDeleted() as RemoteCauscapeElement[],
          causcapeAPI.getAppState(),
        ),
      },
      isExternalScene: true,
      id: roomLinkData.roomId,
      key: roomLinkData.roomKey,
    };
  } else if (scene) {
    return isExternalScene && jsonBackendMatch
      ? {
          scene,
          isExternalScene,
          id: jsonBackendMatch[1],
          key: jsonBackendMatch[2],
        }
      : { scene, isExternalScene: false };
  }
  return { scene: null, isExternalScene: false };
};

type CauscapeWrapperProps = {
  initialProject?: Project;
  onProjectCanvasChange?: (
    elements: readonly OrderedCauscapeElement[],
    appState: AppState,
    files: BinaryFiles,
  ) => void;
};

const CauscapeWrapper = ({
  initialProject,
  onProjectCanvasChange,
}: CauscapeWrapperProps) => {
  const causcapeAPI = useCauscapeAPI();
  const initialProjectRef = useRef(initialProject);
  const flowOverlayRef = useRef<CauscapeFlowOverlayHandle>(null);

  const [errorMessage, setErrorMessage] = useState("");
  // The first Causcape slice is intentionally local-first. Keeping this gate
  // explicit prevents upstream collaboration UI from implying a server model,
  // while test mode retains the upstream collaboration regression coverage.
  const isCollabDisabled = !isTestEnv();

  const { editorTheme, appTheme, setAppTheme } = useHandleAppTheme();

  const [langCode, setLangCode] = useAppLangCode();

  const editorInterface = useEditorInterface();

  // initial state
  // ---------------------------------------------------------------------------

  const initialStatePromiseRef = useRef<{
    promise: ResolvablePromise<CauscapeInitialDataState | null>;
  }>({ promise: null! });
  if (!initialStatePromiseRef.current.promise) {
    initialStatePromiseRef.current.promise =
      resolvablePromise<CauscapeInitialDataState | null>();
  }

  const debugCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    trackEvent("load", "frame", getFrame());
    // Delayed so that the app has a time to load the latest SW
    setTimeout(() => {
      trackEvent("load", "version", getVersion());
    }, VERSION_TIMEOUT);
  }, []);

  const [, setShareDialogState] = useAtom(shareDialogStateAtom);
  const [collabAPI] = useAtom(collabAPIAtom);
  const [isCollaborating] = useAtomWithInitialValue(isCollaboratingAtom, () => {
    return isCollaborationLink(window.location.href);
  });
  const collabError = useAtomValue(collabErrorIndicatorAtom);
  const userToFollow = useAtomValue(userToFollowAtom);

  const viewportStatusFrame = useMemo(
    () =>
      userToFollow
        ? {
            border: "var(--color-primary-hover)",
            label: {
              label: (
                <>
                  Following{" "}
                  <span
                    style={{
                      display: "block",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      maxWidth: 100,
                    }}
                    title={userToFollow.username}
                  >
                    {userToFollow.username}
                  </span>
                </>
              ),
              onClose: () => collabAPI?.setUserToFollow(null),
            },
          }
        : null,
    [userToFollow, collabAPI],
  );

  useHandleLibrary({
    causcapeAPI,
    adapter: LibraryIndexedDBAdapter,
    // TODO maybe remove this in several months (shipped: 24-03-11)
    migrationAdapter: LibraryLocalStorageMigrationAdapter,
  });

  const [, forceRefresh] = useState(false);

  useEffect(() => {
    if (isDevEnv()) {
      const debugState = loadSavedDebugState();

      if (debugState.enabled && !window.visualDebug) {
        window.visualDebug = {
          data: [],
        };
      } else {
        delete window.visualDebug;
      }
      forceRefresh((prev) => !prev);
    }
  }, [causcapeAPI]);

  // ?collaborators=<N> — populate the canvas with N static fake
  // collaborators for exercising avatar/UserList UI without a real
  // collab room
  useSimulatedCollaborators(causcapeAPI);

  // ---------------------------------------------------------------------------
  // Hoisted loadImages
  // ---------------------------------------------------------------------------
  const loadImages = useCallback(
    (data: ResolutionType<typeof initializeScene>, isInitialLoad = false) => {
      if (!data.scene || !causcapeAPI) {
        return;
      }

      if (collabAPI?.isCollaborating()) {
        if (data.scene.elements) {
          collabAPI
            .fetchImageFilesFromFirebase({
              elements: data.scene.elements,
              forceFetchFiles: true,
            })
            .then(({ loadedFiles, erroredFiles }) => {
              causcapeAPI.addFiles(loadedFiles);
              updateStaleImageStatuses({
                causcapeAPI,
                erroredFiles,
                elements: causcapeAPI.getSceneElementsIncludingDeleted(),
              });
            });
        }
      } else {
        const fileIds =
          data.scene.elements?.reduce((acc, element) => {
            if (isInitializedImageElement(element)) {
              return acc.concat(element.fileId);
            }
            return acc;
          }, [] as FileId[]) || [];

        if (data.isExternalScene) {
          if (fileIds.length) {
            // Direct Firebase call (not through FileManager), so track manually
            FileStatusStore.updateStatuses(
              fileIds.map((id) => [id, "loading"]),
            );
          }
          loadFilesFromFirebase(
            `${FIREBASE_STORAGE_PREFIXES.shareLinkFiles}/${data.id}`,
            data.key,
            fileIds,
          ).then(({ loadedFiles, erroredFiles }) => {
            causcapeAPI.addFiles(loadedFiles);
            updateStaleImageStatuses({
              causcapeAPI,
              erroredFiles,
              elements: causcapeAPI.getSceneElementsIncludingDeleted(),
            });
            FileStatusStore.updateStatuses([
              ...loadedFiles.map((f) => [f.id, "loaded"] as [FileId, "loaded"]),
              ...[...erroredFiles.keys()].map(
                (id) => [id, "error"] as [FileId, "error"],
              ),
            ]);
          });
        } else if (isInitialLoad) {
          if (fileIds.length) {
            LocalData.fileStorage
              .getFiles(fileIds)
              .then(async ({ loadedFiles, erroredFiles }) => {
                if (loadedFiles.length) {
                  causcapeAPI.addFiles(loadedFiles);
                }
                updateStaleImageStatuses({
                  causcapeAPI,
                  erroredFiles,
                  elements: causcapeAPI.getSceneElementsIncludingDeleted(),
                });
              });
          }
          // on fresh load, clear unused files from IDB (from previous
          // session)
          LocalData.fileStorage.clearObsoleteFiles({
            currentFileIds: fileIds,
          });
        }
      }
    },
    [collabAPI, causcapeAPI],
  );

  useEffect(() => {
    if (!causcapeAPI || (!isCollabDisabled && !collabAPI)) {
      return;
    }

    if (initialProjectRef.current) {
      initialStatePromiseRef.current.promise.resolve(
        initialProjectRef.current.canvas
          .scene as unknown as CauscapeInitialDataState,
      );
      return;
    }

    initializeScene({ collabAPI, causcapeAPI }).then(async (data) => {
      loadImages(data, /* isInitialLoad */ true);
      initialStatePromiseRef.current.promise.resolve(data.scene);
    });

    const onHashChange = async (event: HashChangeEvent) => {
      event.preventDefault();
      const libraryUrlTokens = parseLibraryTokensFromUrl();
      if (!libraryUrlTokens) {
        if (
          collabAPI?.isCollaborating() &&
          !isCollaborationLink(window.location.href)
        ) {
          collabAPI.stopCollaboration(false);
        }
        causcapeAPI.updateScene({ appState: { isLoading: true } });

        initializeScene({ collabAPI, causcapeAPI }).then((data) => {
          loadImages(data);
          if (data.scene) {
            causcapeAPI.updateScene({
              elements: restoreElements(data.scene.elements, null, {
                repairBindings: true,
              }),
              appState: restoreAppState(data.scene.appState, null),
              captureUpdate: CaptureUpdateAction.IMMEDIATELY,
            });
          }
        });
      }
    };

    const syncData = debounce(() => {
      if (isTestEnv()) {
        return;
      }
      if (
        !document.hidden &&
        ((collabAPI && !collabAPI.isCollaborating()) || isCollabDisabled)
      ) {
        // don't sync if local state is newer or identical to browser state
        if (isBrowserStorageStateNewer(STORAGE_KEYS.VERSION_DATA_STATE)) {
          const localDataState = importFromLocalStorage();
          const username = importUsernameFromLocalStorage();
          setLangCode(getPreferredLanguage());
          causcapeAPI.updateScene({
            ...localDataState,
            captureUpdate: CaptureUpdateAction.NEVER,
          });
          LibraryIndexedDBAdapter.load().then((data) => {
            if (data) {
              causcapeAPI.updateLibrary({
                libraryItems: data.libraryItems,
              });
            }
          });
          collabAPI?.setUsername(username || "");
        }

        if (isBrowserStorageStateNewer(STORAGE_KEYS.VERSION_FILES)) {
          const elements = causcapeAPI.getSceneElementsIncludingDeleted();
          const currFiles = causcapeAPI.getFiles();
          const fileIds =
            elements?.reduce((acc, element) => {
              if (
                isInitializedImageElement(element) &&
                // only load and update images that aren't already loaded
                !currFiles[element.fileId]
              ) {
                return acc.concat(element.fileId);
              }
              return acc;
            }, [] as FileId[]) || [];
          if (fileIds.length) {
            LocalData.fileStorage
              .getFiles(fileIds)
              .then(({ loadedFiles, erroredFiles }) => {
                if (loadedFiles.length) {
                  causcapeAPI.addFiles(loadedFiles);
                }
                updateStaleImageStatuses({
                  causcapeAPI,
                  erroredFiles,
                  elements: causcapeAPI.getSceneElementsIncludingDeleted(),
                });
              });
          }
        }
      }
    }, SYNC_BROWSER_TABS_TIMEOUT);

    const onUnload = () => {
      LocalData.flushSave();
    };

    const visibilityChange = (event: FocusEvent | Event) => {
      if (event.type === EVENT.BLUR || document.hidden) {
        LocalData.flushSave();
      }
      if (
        event.type === EVENT.VISIBILITY_CHANGE ||
        event.type === EVENT.FOCUS
      ) {
        syncData();
      }
    };

    window.addEventListener(EVENT.HASHCHANGE, onHashChange, false);
    window.addEventListener(EVENT.UNLOAD, onUnload, false);
    window.addEventListener(EVENT.BLUR, visibilityChange, false);
    document.addEventListener(EVENT.VISIBILITY_CHANGE, visibilityChange, false);
    window.addEventListener(EVENT.FOCUS, visibilityChange, false);
    return () => {
      window.removeEventListener(EVENT.HASHCHANGE, onHashChange, false);
      window.removeEventListener(EVENT.UNLOAD, onUnload, false);
      window.removeEventListener(EVENT.BLUR, visibilityChange, false);
      window.removeEventListener(EVENT.FOCUS, visibilityChange, false);
      document.removeEventListener(
        EVENT.VISIBILITY_CHANGE,
        visibilityChange,
        false,
      );
    };
  }, [isCollabDisabled, collabAPI, causcapeAPI, setLangCode, loadImages]);

  useEffect(() => {
    const unloadHandler = (event: BeforeUnloadEvent) => {
      LocalData.flushSave();

      if (
        causcapeAPI &&
        LocalData.fileStorage.shouldPreventUnload(
          causcapeAPI.getSceneElements(),
        )
      ) {
        if (import.meta.env.VITE_APP_DISABLE_PREVENT_UNLOAD !== "true") {
          preventUnload(event);
        } else {
          console.warn(
            "preventing unload disabled (VITE_APP_DISABLE_PREVENT_UNLOAD)",
          );
        }
      }
    };
    window.addEventListener(EVENT.BEFORE_UNLOAD, unloadHandler);
    return () => {
      window.removeEventListener(EVENT.BEFORE_UNLOAD, unloadHandler);
    };
  }, [causcapeAPI]);

  useEffect(() => {
    if (!causcapeAPI) {
      return;
    }

    let active = true;
    const syncFlowOverlay = () => {
      if (active) {
        flowOverlayRef.current?.update(
          causcapeAPI.getSceneElementsIncludingDeleted() as readonly OrderedCauscapeElement[],
          causcapeAPI.getAppState(),
        );
      }
    };
    const unsubscribeChange = causcapeAPI.onChange((elements, appState) => {
      flowOverlayRef.current?.update(
        elements as readonly OrderedCauscapeElement[],
        appState,
      );
    });
    const unsubscribeIncrement = causcapeAPI.onIncrement(syncFlowOverlay);
    const unsubscribeScroll = causcapeAPI.onScrollChange(syncFlowOverlay);

    syncFlowOverlay();
    // The API mounts before async project restoration completes. Sync once
    // that initial scene has been consumed so existing flows appear without
    // requiring the user to edit or move the canvas first.
    void initialStatePromiseRef.current.promise.then(syncFlowOverlay);

    return () => {
      active = false;
      unsubscribeChange();
      unsubscribeIncrement();
      unsubscribeScroll();
    };
  }, [causcapeAPI]);

  const onChange = (
    elements: readonly OrderedCauscapeElement[],
    appState: AppState,
    files: BinaryFiles,
  ) => {
    onProjectCanvasChange?.(elements, appState, files);

    if (collabAPI?.isCollaborating()) {
      collabAPI.syncElements(elements);
    }

    // this check is redundant, but since this is a hot path, it's best
    // not to evaludate the nested expression every time
    if (!LocalData.isSavePaused()) {
      LocalData.save(elements, appState, files, () => {
        if (causcapeAPI) {
          let didChange = false;

          const elements = causcapeAPI
            .getSceneElementsIncludingDeleted()
            .map((element) => {
              if (
                LocalData.fileStorage.shouldUpdateImageElementStatus(element)
              ) {
                const newElement = newElementWith(element, { status: "saved" });
                if (newElement !== element) {
                  didChange = true;
                }
                return newElement;
              }
              return element;
            });

          if (didChange) {
            causcapeAPI.updateScene({
              elements,
              captureUpdate: CaptureUpdateAction.NEVER,
            });
          }
        }
      });
    }

    // Render the debug scene if the debug canvas is available
    if (debugCanvasRef.current && causcapeAPI) {
      debugRenderer(
        debugCanvasRef.current,
        appState,
        elements,
        window.devicePixelRatio,
      );
    }
  };

  const [latestShareableLink, setLatestShareableLink] = useState<string | null>(
    null,
  );

  const onExportToBackend = async (
    exportedElements: readonly NonDeletedCauscapeElement[],
    appState: Partial<AppState>,
    files: BinaryFiles,
  ) => {
    if (exportedElements.length === 0) {
      throw new Error(t("alerts.cannotExportEmptyCanvas"));
    }
    try {
      const { url, errorMessage } = await exportToBackend(
        exportedElements,
        {
          ...appState,
          viewBackgroundColor: appState.exportBackground
            ? appState.viewBackgroundColor
            : getDefaultAppState().viewBackgroundColor,
        },
        files,
      );

      if (errorMessage) {
        throw new Error(errorMessage);
      }

      if (url) {
        setLatestShareableLink(url);
      }
    } catch (error: any) {
      if (error.name !== "AbortError") {
        const { width, height } = appState;
        console.error(error, {
          width,
          height,
          devicePixelRatio: window.devicePixelRatio,
        });
        throw new Error(error.message);
      }
    }
  };

  const renderCustomStats = (
    elements: readonly NonDeletedCauscapeElement[],
    appState: UIAppState,
  ) => {
    return (
      <CustomStats
        setToast={(message) => causcapeAPI!.setToast({ message })}
        appState={appState}
        elements={elements}
      />
    );
  };

  const isOffline = useAtomValue(isOfflineAtom);

  const localStorageQuotaExceeded = useAtomValue(localStorageQuotaExceededAtom);

  const onCollabDialogOpen = useCallback(
    () => setShareDialogState({ isOpen: true, type: "collaborationOnly" }),
    [setShareDialogState],
  );

  // ---------------------------------------------------------------------------
  // onExport — intercepts file save to wait for pending image loads
  // ---------------------------------------------------------------------------
  const onExport: Required<CauscapeProps>["onExport"] = useCallback(
    async function* () {
      let snapshot = FileStatusStore.getSnapshot();
      const { pending, total } = FileStatusStore.getPendingCount(
        snapshot.value,
      );
      if (pending === 0) {
        return;
      }

      // Yield initial progress
      yield {
        type: "progress",
        progress: (total - pending) / total,
        message: `Loading images (${total - pending}/${total})...`,
      };

      // Wait for all pending images to finish
      while (true) {
        snapshot = await FileStatusStore.pull(snapshot.version);
        const { pending: nowPending, total: nowTotal } =
          FileStatusStore.getPendingCount(snapshot.value);

        yield {
          type: "progress",
          progress: (nowTotal - nowPending) / nowTotal,
          message: `Loading images (${nowTotal - nowPending}/${nowTotal})...`,
        };

        if (nowPending === 0) {
          await new Promise((r) => setTimeout(r, 500));
          yield {
            type: "progress",
            message: `Preparing export...`,
          };
          return;
        }
      }
    },
    [],
  );

  // const onExport = () => {
  //   return new Promise((r) => setTimeout(r, 2500));
  //   // console.log("onExport");
  // };

  // browsers generally prevent infinite self-embedding, there are
  // cases where it still happens, and while we disallow self-embedding
  // by not whitelisting our own origin, this serves as an additional guard
  if (isSelfEmbedding) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          height: "100%",
        }}
      >
        <h1>I'm not a pretzel!</h1>
      </div>
    );
  }

  const CauscapePlusCommand = {
    label: "Causcape+",
    category: DEFAULT_CATEGORIES.links,
    predicate: true,
    icon: <div style={{ width: 14 }}>{ExcalLogo}</div>,
    keywords: ["plus", "cloud", "server"],
    perform: () => {
      window.open(
        `${
          import.meta.env.VITE_APP_PLUS_LP
        }/plus?utm_source=causcape&utm_medium=app&utm_content=command_palette`,
        "_blank",
      );
    },
  };
  const CauscapePlusAppCommand = {
    label: "Sign up",
    category: DEFAULT_CATEGORIES.links,
    predicate: true,
    icon: <div style={{ width: 14 }}>{ExcalLogo}</div>,
    keywords: [
      "causcape",
      "plus",
      "cloud",
      "server",
      "signin",
      "login",
      "signup",
    ],
    perform: () => {
      window.open(
        `${
          import.meta.env.VITE_APP_PLUS_APP
        }?utm_source=causcape&utm_medium=app&utm_content=command_palette`,
        "_blank",
      );
    },
  };

  return (
    <div
      style={{ height: "100%" }}
      className={clsx("causcape-app", {
        "is-collaborating": isCollaborating,
      })}
    >
      <Causcape
        viewportStatusFrame={viewportStatusFrame}
        userToFollow={userToFollow}
        onChange={onChange}
        onExport={onExport}
        initialData={initialStatePromiseRef.current.promise}
        isCollaborating={isCollaborating}
        onPointerUpdate={collabAPI?.onPointerUpdate}
        UIOptions={{
          canvasActions: {
            toggleTheme: true,
            export: {
              onExportToBackend,
              renderCustomUI: causcapeAPI
                ? (elements, appState, files) => {
                    return (
                      <ExportToCauscapePlus
                        elements={elements}
                        appState={appState}
                        files={files}
                        name={causcapeAPI.getName()}
                        onError={(error) => {
                          causcapeAPI?.updateScene({
                            appState: {
                              errorMessage: error.message,
                            },
                          });
                        }}
                        onSuccess={() => {
                          causcapeAPI.updateScene({
                            appState: { openDialog: null },
                          });
                        }}
                      />
                    );
                  }
                : undefined,
            },
          },
        }}
        langCode={langCode}
        renderCustomStats={renderCustomStats}
        detectScroll={false}
        handleKeyboardGlobally={false}
        autoFocus={true}
        theme={editorTheme}
        onThemeChange={setAppTheme}
        renderTopRightUI={(isMobile) => {
          if (isMobile || !collabAPI || isCollabDisabled) {
            return null;
          }

          return (
            <div className="causcape-ui-top-right">
              {causcapeAPI?.getEditorInterface().formFactor === "desktop" && (
                <CauscapePlusPromoBanner
                  isSignedIn={isCauscapePlusSignedUser}
                />
              )}

              {collabError.message && <CollabError collabError={collabError} />}
              <LiveCollaborationTrigger
                isCollaborating={isCollaborating}
                onSelect={() =>
                  setShareDialogState({ isOpen: true, type: "share" })
                }
                editorInterface={editorInterface}
              />
            </div>
          );
        }}
        renderCauscapeEdgeLabels={false}
        onLinkOpen={(element, event) => {
          if (element.link && isElementLink(element.link)) {
            event.preventDefault();
            causcapeAPI?.setViewport({
              target: element.link,
              fit: "scale-down",
              animation: true,
            });
          }
        }}
      >
        <AppMainMenu
          onCollabDialogOpen={onCollabDialogOpen}
          isCollaborating={isCollaborating}
          isCollabEnabled={!isCollabDisabled}
          theme={appTheme}
          refresh={() => forceRefresh((prev) => !prev)}
        />
        <AppWelcomeScreen
          onCollabDialogOpen={onCollabDialogOpen}
          isCollabEnabled={!isCollabDisabled}
        />
        <OverwriteConfirmDialog>
          <OverwriteConfirmDialog.Actions.ExportToImage />
          <OverwriteConfirmDialog.Actions.SaveToDisk />
          {causcapeAPI && (
            <OverwriteConfirmDialog.Action
              title={t("overwriteConfirm.action.causcapePlus.title")}
              actionLabel={t("overwriteConfirm.action.causcapePlus.button")}
              onClick={() => {
                exportToCauscapePlus(
                  causcapeAPI.getSceneElements(),
                  causcapeAPI.getAppState(),
                  causcapeAPI.getFiles(),
                  causcapeAPI.getName(),
                );
              }}
            >
              {t("overwriteConfirm.action.causcapePlus.description")}
            </OverwriteConfirmDialog.Action>
          )}
        </OverwriteConfirmDialog>
        <AppFooter onChange={() => causcapeAPI?.refresh()} />
        {causcapeAPI && <AIComponents causcapeAPI={causcapeAPI} />}

        <TTDDialogTrigger />
        {isCollaborating && isOffline && (
          <div className="alertalert--warning">
            {t("alerts.collabOfflineWarning")}
          </div>
        )}
        {localStorageQuotaExceeded && (
          <div className="alert alert--danger">
            {t("alerts.localStorageQuotaExceeded")}
          </div>
        )}
        {latestShareableLink && (
          <ShareableLinkDialog
            link={latestShareableLink}
            onCloseRequest={() => setLatestShareableLink(null)}
            setErrorMessage={setErrorMessage}
          />
        )}
        {causcapeAPI && !isCollabDisabled && (
          <Collab causcapeAPI={causcapeAPI} />
        )}
        {causcapeAPI && <GraphMCPBridge />}

        <ShareDialog
          collabAPI={collabAPI}
          onExportToBackend={async () => {
            if (causcapeAPI) {
              try {
                await onExportToBackend(
                  causcapeAPI.getSceneElements(),
                  causcapeAPI.getAppState(),
                  causcapeAPI.getFiles(),
                );
              } catch (error: any) {
                setErrorMessage(error.message);
              }
            }
          }}
        />

        <AppSidebar />

        {errorMessage && (
          <ErrorDialog onClose={() => setErrorMessage("")}>
            {errorMessage}
          </ErrorDialog>
        )}

        <CommandPalette
          customCommandPaletteItems={[
            {
              label: t("labels.liveCollaboration"),
              category: DEFAULT_CATEGORIES.app,
              keywords: [
                "team",
                "multiplayer",
                "share",
                "public",
                "session",
                "invite",
              ],
              icon: usersIcon,
              perform: () => {
                setShareDialogState({
                  isOpen: true,
                  type: "collaborationOnly",
                });
              },
            },
            {
              label: t("roomDialog.button_stopSession"),
              category: DEFAULT_CATEGORIES.app,
              predicate: () => !!collabAPI?.isCollaborating(),
              keywords: [
                "stop",
                "session",
                "end",
                "leave",
                "close",
                "exit",
                "collaboration",
              ],
              perform: () => {
                if (collabAPI) {
                  collabAPI.stopCollaboration();
                  if (!collabAPI.isCollaborating()) {
                    setShareDialogState({ isOpen: false });
                  }
                }
              },
            },
            {
              label: t("labels.share"),
              category: DEFAULT_CATEGORIES.app,
              predicate: true,
              icon: share,
              keywords: [
                "link",
                "shareable",
                "readonly",
                "export",
                "publish",
                "snapshot",
                "url",
                "collaborate",
                "invite",
              ],
              perform: async () => {
                setShareDialogState({ isOpen: true, type: "share" });
              },
            },
            {
              label: "GitHub",
              icon: GithubIcon,
              category: DEFAULT_CATEGORIES.links,
              predicate: true,
              keywords: [
                "issues",
                "bugs",
                "requests",
                "report",
                "features",
                "social",
                "community",
              ],
              perform: () => {
                window.open(
                  "https://github.com/causcape/causcape",
                  "_blank",
                  "noopener noreferrer",
                );
              },
            },
            {
              label: t("labels.followUs"),
              icon: XBrandIcon,
              category: DEFAULT_CATEGORIES.links,
              predicate: true,
              keywords: ["twitter", "contact", "social", "community"],
              perform: () => {
                window.open(
                  "https://x.com/causcape",
                  "_blank",
                  "noopener noreferrer",
                );
              },
            },
            {
              label: t("labels.discordChat"),
              category: DEFAULT_CATEGORIES.links,
              predicate: true,
              icon: DiscordIcon,
              keywords: [
                "chat",
                "talk",
                "contact",
                "bugs",
                "requests",
                "report",
                "feedback",
                "suggestions",
                "social",
                "community",
              ],
              perform: () => {
                window.open(
                  "https://discord.gg/UexuTaE",
                  "_blank",
                  "noopener noreferrer",
                );
              },
            },
            {
              label: "YouTube",
              icon: youtubeIcon,
              category: DEFAULT_CATEGORIES.links,
              predicate: true,
              keywords: ["features", "tutorials", "howto", "help", "community"],
              perform: () => {
                window.open(
                  "https://youtube.com/@causcape",
                  "_blank",
                  "noopener noreferrer",
                );
              },
            },
            ...(isCauscapePlusSignedUser
              ? [
                  {
                    ...CauscapePlusAppCommand,
                    label: "Sign in / Go to Causcape+",
                  },
                ]
              : [CauscapePlusCommand, CauscapePlusAppCommand]),

            {
              label: t("overwriteConfirm.action.causcapePlus.button"),
              category: DEFAULT_CATEGORIES.export,
              icon: exportToPlus,
              predicate: true,
              keywords: ["plus", "export", "save", "backup"],
              perform: () => {
                if (causcapeAPI) {
                  exportToCauscapePlus(
                    causcapeAPI.getSceneElements(),
                    causcapeAPI.getAppState(),
                    causcapeAPI.getFiles(),
                    causcapeAPI.getName(),
                  );
                }
              },
            },
            {
              label: t("labels.installPWA"),
              category: DEFAULT_CATEGORIES.app,
              predicate: () => !!pwaEvent,
              perform: () => {
                if (pwaEvent) {
                  pwaEvent.prompt();
                  pwaEvent.userChoice.then(() => {
                    // event cannot be reused, but we'll hopefully
                    // grab new one as the event should be fired again
                    pwaEvent = null;
                  });
                }
              },
            },
          ]}
        />
        {isVisualDebuggerEnabled() && causcapeAPI && (
          <DebugCanvas
            appState={causcapeAPI.getAppState()}
            scale={window.devicePixelRatio}
            ref={debugCanvasRef}
          />
        )}
      </Causcape>
      <CauscapeFlowOverlay ref={flowOverlayRef} />
    </div>
  );
};

const createBrowserProject = (template: ProjectTemplate) => {
  const title =
    template === "architecture"
      ? "Untitled architecture"
      : template === "post-incident"
      ? "Untitled post-incident"
      : "Untitled engineering project";
  return createProjectFromTemplate({
    id: randomId(),
    title,
    template,
    occurredAt: new Date().toISOString(),
    provenance: {
      actor: { type: "human", id: "local-user" },
      channel: "browser",
      summary: `Created from the ${template} template`,
    },
  });
};

const serializeCanvasScene = (
  elements: readonly OrderedCauscapeElement[],
  appState: AppState,
  files: BinaryFiles,
): Project["canvas"]["scene"] =>
  JSON.parse(
    JSON.stringify({
      elements,
      appState: clearAppStateForLocalStorage(appState),
      files,
    }),
  ) as Project["canvas"]["scene"];

const CauscapeProjectWorkspace = () => {
  const causcapeAPI = useCauscapeAPI();
  const workspaceRef = useRef<HTMLDivElement>(null);
  const repositoryRef = useRef<CauscapeProjectRepository | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [projects, setProjects] = useState<readonly ProjectSummary[]>([]);
  const [showDashboard, setShowDashboard] = useState(false);
  const [selectedObjectIds, setSelectedObjectIds] = useState<readonly string[]>(
    [],
  );
  const [isDocumentEditable, setIsDocumentEditable] = useState(true);
  const [projectError, setProjectError] = useState("");
  const projectRef = useRef(project);
  projectRef.current = project;

  const getProjectForMCP = useCallback(() => projectRef.current, []);
  const setProjectFromMCP = useCallback((nextProject: Project) => {
    projectRef.current = nextProject;
    setProject(nextProject);
  }, []);
  const getWorkspaceOwnerDocument = useCallback(
    () => workspaceRef.current?.ownerDocument ?? null,
    [],
  );

  const refreshProjects = useCallback(async () => {
    if (repositoryRef.current) {
      setProjects(await repositoryRef.current.list());
    }
  }, []);

  useEffect(() => {
    if (repositoryRef.current) {
      return;
    }
    const ownerWindow = workspaceRef.current?.ownerDocument.defaultView;
    if (!ownerWindow) {
      return;
    }
    const repository = new CauscapeProjectRepository(
      new IndexedDbProjectDriver(ownerWindow.indexedDB),
    );
    repositoryRef.current = repository;

    void repository
      .list()
      .then(async (summaries) => {
        setProjects(summaries);
        if (summaries[0]) {
          setProject(await repository.load(summaries[0].id));
          return;
        }
        const initialProject = createBrowserProject("blank");
        await repository.save(initialProject);
        setProject(initialProject);
        setProjects(await repository.list());
      })
      .catch((error: Error) => setProjectError(error.message));
  }, []);

  useEffect(() => {
    const ownerWindow = workspaceRef.current?.ownerDocument.defaultView;
    if (!project || !ownerWindow || !repositoryRef.current) {
      return;
    }
    const timeout = ownerWindow.setTimeout(() => {
      void repositoryRef.current
        ?.save(project)
        .catch((error: Error) => setProjectError(error.message));
    }, 350);
    return () => ownerWindow.clearTimeout(timeout);
  }, [project]);

  const handleCanvasChange = useCallback(
    (
      elements: readonly OrderedCauscapeElement[],
      appState: AppState,
      files: BinaryFiles,
    ) => {
      const nextSelectedObjectIds = getSelectedCanvasObjectIds(
        elements,
        appState.selectedElementIds,
      );
      setSelectedObjectIds((currentIds) =>
        currentIds.length === nextSelectedObjectIds.length &&
        currentIds.every((id, index) => id === nextSelectedObjectIds[index])
          ? currentIds
          : nextSelectedObjectIds,
      );
      setProject((currentProject) => {
        if (!currentProject) {
          return currentProject;
        }
        const nextObjects = deriveCanvasObjects(
          elements,
          currentProject.canvas.objects,
        );
        const nextScene = serializeCanvasScene(elements, appState, files);
        if (
          JSON.stringify(currentProject.canvas.scene) ===
            JSON.stringify(nextScene) &&
          JSON.stringify(currentProject.canvas.objects) ===
            JSON.stringify(nextObjects)
        ) {
          return currentProject;
        }
        return {
          ...currentProject,
          updatedAt: new Date().toISOString(),
          canvas: { scene: nextScene, objects: nextObjects },
        };
      });
    },
    [],
  );

  const handleDocumentChange = useCallback((document: CauscapeDocument) => {
    setProject((currentProject) => {
      if (
        !currentProject ||
        JSON.stringify(currentProject.document) === JSON.stringify(document)
      ) {
        return currentProject;
      }
      const result = transactProject(currentProject, {
        id: `browser-document-${randomId()}`,
        expectedRevision: currentProject.revision,
        occurredAt: new Date().toISOString(),
        provenance: {
          actor: { type: "human", id: "local-user" },
          channel: "browser",
          summary: "Edited the structured project document",
        },
        operations: [{ type: "document.replace", document }],
      });
      return result.ok ? result.value : currentProject;
    });
  }, []);

  const focusCanvasObject = useCallback(
    (objectId: string) => {
      const object = project?.canvas.objects[objectId];
      const elementId = object?.elementIds[0];
      if (!causcapeAPI || !elementId || object.state !== "active") {
        return;
      }
      causcapeAPI.updateScene({
        appState: {
          selectedElementIds: Object.fromEntries(
            object.elementIds.map((id) => [id, true] as const),
          ),
        },
      });
      causcapeAPI.setViewport({
        target: elementId,
        fit: "scale-down",
        animation: true,
      });
    },
    [causcapeAPI, project?.canvas.objects],
  );

  const createProject = useCallback(async (template: ProjectTemplate) => {
    if (!repositoryRef.current) {
      return;
    }
    const nextProject = createBrowserProject(template);
    await repositoryRef.current.save(nextProject);
    setProject(nextProject);
    setSelectedObjectIds([]);
    setShowDashboard(false);
    setProjects(await repositoryRef.current.list());
  }, []);

  const openLocalProject = useCallback(async (id: string) => {
    if (!repositoryRef.current) {
      return;
    }
    const opened = await repositoryRef.current.load(id);
    if (opened) {
      setProject(opened);
      setSelectedObjectIds([]);
      setShowDashboard(false);
    }
  }, []);

  const importProject = useCallback(async (file: File) => {
    if (!repositoryRef.current) {
      return;
    }
    try {
      const imported = await repositoryRef.current.importCopy(
        await file.text(),
        { id: randomId(), occurredAt: new Date().toISOString() },
      );
      setProject(imported);
      setSelectedObjectIds([]);
      setShowDashboard(false);
      setProjects(await repositoryRef.current.list());
      setProjectError("");
    } catch (error) {
      setProjectError(
        error instanceof Error ? error.message : "Could not import project",
      );
    }
  }, []);

  const exportProject = useCallback(() => {
    const ownerDocument = workspaceRef.current?.ownerDocument;
    if (project && ownerDocument) {
      downloadProjectFile(project, ownerDocument);
    }
  }, [project]);

  const selectedObject = useMemo<CanvasObject | null>(() => {
    const objectId = selectedObjectIds[0];
    return objectId ? project?.canvas.objects[objectId] ?? null : null;
  }, [project?.canvas.objects, selectedObjectIds]);

  const addPreparedShape = useCallback(
    (kind: PreparedEngineeringShapeKind) => {
      if (!causcapeAPI) {
        return;
      }
      const appState = causcapeAPI.getAppState();
      const preparedShape = PREPARED_ENGINEERING_SHAPES.find(
        (shape) => shape.kind === kind,
      );
      if (!preparedShape) {
        return;
      }
      const center = viewportCoordsToSceneCoords(
        {
          clientX: appState.offsetLeft + appState.width / 2,
          clientY: appState.offsetTop + appState.height / 2,
        },
        appState,
      );
      const elements = createPreparedEngineeringShape({
        kind,
        x: center.x - preparedShape.width / 2,
        y: center.y - preparedShape.height / 2,
      });
      causcapeAPI.updateScene({
        elements: [
          ...causcapeAPI.getSceneElementsIncludingDeleted(),
          ...elements,
        ],
        appState: {
          selectedElementIds: Object.fromEntries(
            elements.map((element) => [element.id, true] as const),
          ),
        },
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      });
    },
    [causcapeAPI],
  );

  const updateObjectElements = useCallback(
    (
      objectId: string,
      updates: {
        readonly name?: string;
        readonly description?: string;
        readonly metadata?: Readonly<Record<string, MetadataValue>>;
      },
    ) => {
      const object = project?.canvas.objects[objectId];
      if (!causcapeAPI || !object || object.state !== "active") {
        return;
      }
      const objectElementIds = new Set(object.elementIds);
      const elements = causcapeAPI
        .getSceneElementsIncludingDeleted()
        .map((element) => {
          if (!objectElementIds.has(element.id)) {
            return element;
          }
          const causcapeData = element.customData?.causcape ?? {};
          const descriptionWasUpdated = "description" in updates;
          const customData = {
            ...element.customData,
            causcape: {
              ...causcapeData,
              ...(updates.name ? { name: updates.name } : {}),
              ...(descriptionWasUpdated
                ? { description: updates.description }
                : {}),
              ...(updates.metadata ? { metadata: updates.metadata } : {}),
            },
          };
          if (element.type === "causcape-node") {
            return newElementWith(element, {
              customData,
              causcape: {
                ...element.causcape,
                ...(updates.name ? { label: updates.name } : {}),
                ...(descriptionWasUpdated
                  ? { description: updates.description ?? "" }
                  : {}),
              },
            });
          }
          return element.type === "text" && updates.name
            ? newElementWith(element, {
                customData,
                text: updates.name,
                originalText: updates.name,
              })
            : newElementWith(element, { customData });
        });
      causcapeAPI.updateScene({
        elements,
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      });
    },
    [causcapeAPI, project?.canvas.objects],
  );

  const renameCanvasObject = useCallback(
    (objectId: string, name: string) => {
      updateObjectElements(objectId, { name });
    },
    [updateObjectElements],
  );

  const updateCanvasObjectDescription = useCallback(
    (objectId: string, description: string) => {
      updateObjectElements(objectId, { description });
    },
    [updateObjectElements],
  );

  const setCanvasObjectMetadata = useCallback(
    (objectId: string, key: string, value: MetadataValue) => {
      const object = project?.canvas.objects[objectId];
      if (object) {
        updateObjectElements(objectId, {
          metadata: { ...object.metadata, [key]: value },
        });
      }
    },
    [project?.canvas.objects, updateObjectElements],
  );

  const deleteCanvasObjectMetadata = useCallback(
    (objectId: string, key: string) => {
      const object = project?.canvas.objects[objectId];
      if (!object || key === "kind") {
        return;
      }
      const metadata = { ...object.metadata };
      delete metadata[key];
      updateObjectElements(objectId, { metadata });
    },
    [project?.canvas.objects, updateObjectElements],
  );

  if (showDashboard) {
    return (
      <div ref={workspaceRef}>
        <CauscapeProjectDashboard
          projects={projects}
          onOpen={(id) => void openLocalProject(id)}
          onCreate={(template) => void createProject(template)}
          onImport={(file) => void importProject(file)}
        />
        {projectError ? (
          <p className="causcape-project-error" role="alert">
            {projectError}
          </p>
        ) : null}
      </div>
    );
  }

  if (!project) {
    return (
      <div ref={workspaceRef} className="causcape-project-loading">
        {projectError || "Opening your project…"}
      </div>
    );
  }

  return (
    <div ref={workspaceRef}>
      <CauscapeProjectShell
        canvas={
          <div className="causcape-canvas-stack">
            <CauscapeWrapper
              key={project.id}
              initialProject={project}
              onProjectCanvasChange={handleCanvasChange}
            />
            <CauscapeProjectActions
              onOpenProjects={() => {
                void refreshProjects();
                setShowDashboard(true);
              }}
              onExport={exportProject}
            />
          </div>
        }
        canvasControls={
          <CauscapeEngineeringTools
            selectedObject={selectedObject}
            onAddShape={addPreparedShape}
            onRename={renameCanvasObject}
            onDescriptionChange={updateCanvasObjectDescription}
            onMetadataSet={setCanvasObjectMetadata}
            onMetadataDelete={deleteCanvasObjectMetadata}
          />
        }
        document={
          <article>
            <CauscapeDocumentHeader
              editable={isDocumentEditable}
              onEditableChange={setIsDocumentEditable}
            />
            <Suspense
              fallback={
                <p className="causcape-document-loading">Loading document…</p>
              }
            >
              <CauscapeDocumentEditor
                key={project.id}
                document={project.document}
                objects={project.canvas.objects}
                selectedObjectIds={selectedObjectIds}
                editable={isDocumentEditable}
                onChange={handleDocumentChange}
                onReferenceActivate={focusCanvasObject}
              />
            </Suspense>
          </article>
        }
      />
      <ProjectMCPBridge
        getProject={getProjectForMCP}
        setProject={setProjectFromMCP}
        getOwnerDocument={getWorkspaceOwnerDocument}
      />
      {projectError ? (
        <p className="causcape-project-error" role="alert">
          {projectError}
        </p>
      ) : null}
    </div>
  );
};

const CauscapeApp = () => {
  const isCloudExportWindow =
    window.location.pathname === "/causcape-plus-export";
  if (isCloudExportWindow) {
    return <CauscapePlusIframeExport />;
  }

  return (
    <TopErrorBoundary>
      <Provider store={appJotaiStore}>
        <CauscapeAPIProvider>
          <CauscapeProjectWorkspace />
        </CauscapeAPIProvider>
      </Provider>
    </TopErrorBoundary>
  );
};

export default CauscapeApp;
