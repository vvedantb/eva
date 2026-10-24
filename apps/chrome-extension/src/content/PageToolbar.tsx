import { useRef, useCallback, useSyncExternalStore } from "react";
import {
  IconEye,
  IconEyeOff,
  IconMapPin,
  IconCrosshair,
} from "@tabler/icons-react";
import {
  getAnnotationState,
  subscribeAnnotation,
  togglePinsHidden,
  notifyTasksCreated,
} from "./AnnotationOverlay";
import {
  getToolbarState,
  subscribeToolbar,
  setToolbarPosition,
  setToolbarLoading,
  setToolbarFeedback,
  setMode,
  openProjectModal,
} from "./toolbar-state";
import {
  subscribeAppearance,
  getAppearance,
  type ExtensionAppearance,
} from "./theme";
import {
  toolbarBackground,
  toolbarBorder,
  toolbarBoxShadow,
  toolbarTextColor,
  toolbarDividerBackground,
  toolbarMutedColor,
  toolbarIconClasses,
} from "./appearance-styles";
import { getPageUrl } from "./page-url";
import { Button } from "@vvedantb/ui";
import { requestBackground, type BgError } from "@/shared/messaging";

function dividerStyle(appearance: ExtensionAppearance): React.CSSProperties {
  return {
    width: 1,
    height: 24,
    background: toolbarDividerBackground(appearance),
  };
}

function feedbackStyle(type: "success" | "error"): React.CSSProperties {
  return {
    fontSize: 12,
    color: type === "success" ? "#16a34a" : "#dc2626",
    fontWeight: 500,
  };
}

function applyErrorFeedback(err: BgError): void {
  if (err.code === "not_signed_in") {
    setToolbarFeedback("Sign in to Eva", "error", "sign_in");
  } else {
    setToolbarFeedback(err.message, "error");
  }
}

export function PageToolbar() {
  const toolbar = useSyncExternalStore(subscribeToolbar, getToolbarState);
  const ext = useSyncExternalStore(subscribeAnnotation, getAnnotationState);
  const appearance = useSyncExternalStore(subscribeAppearance, getAppearance);
  const dragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartY = useRef(0);
  const startX = useRef(0);
  const startY = useRef(0);
  const elRef = useRef<HTMLDivElement>(null);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    dragging.current = true;
    dragStartX.current = e.clientX;
    dragStartY.current = e.clientY;
    const el = elRef.current;
    if (el && getToolbarState().x === -1) {
      const rect = el.getBoundingClientRect();
      setToolbarPosition(rect.left, rect.top);
    }
    startX.current = getToolbarState().x;
    startY.current = getToolbarState().y;
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    const el = elRef.current;
    const w = el ? el.offsetWidth : 300;
    const h = el ? el.offsetHeight : 40;
    const nx = Math.max(
      0,
      Math.min(
        window.innerWidth - w,
        startX.current + (e.clientX - dragStartX.current),
      ),
    );
    const ny = Math.max(
      0,
      Math.min(
        window.innerHeight - h,
        startY.current + (e.clientY - dragStartY.current),
      ),
    );
    setToolbarPosition(nx, ny);
  }, []);

  const onPointerUp = useCallback(() => {
    dragging.current = false;
  }, []);

  const handleRunAll = useCallback(async () => {
    const pins = getAnnotationState().currentPins;
    if (Object.keys(pins).length === 0) return;
    setToolbarLoading(true);
    const res = await requestBackground("RUN_ALL_ANNOTATIONS", {
      pageUrl: getPageUrl(),
      pins,
    });
    if (res.ok) {
      notifyTasksCreated(res.created, res.userId, res.creatorInitials);
      setToolbarFeedback(res.message, "success");
    } else {
      applyErrorFeedback(res);
    }
  }, []);

  if (!toolbar.visible) return null;
  const pinCount = Object.keys(ext.currentPins).length;
  const hasPins = pinCount > 0;
  const actionsDisabled = !hasPins || toolbar.loading;

  const positioned = toolbar.x !== -1;
  const containerStyle: React.CSSProperties = {
    position: "fixed",
    zIndex: 2147483645,
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 16px",
    borderRadius: 9999,
    background: toolbarBackground(appearance),
    backdropFilter: "blur(12px)",
    boxShadow: toolbarBoxShadow(appearance),
    border: toolbarBorder(appearance),
    fontSize: 14,
    color: toolbarTextColor(appearance),
    whiteSpace: "nowrap",
    cursor: dragging.current ? "grabbing" : "grab",
    userSelect: "none",
    touchAction: "none",
    ...(positioned
      ? { left: toolbar.x, top: toolbar.y }
      : { bottom: 16, left: "50%", transform: "translateX(-50%)" }),
  };

  const modeButtonClass = (active: boolean) =>
    `w-8 h-8 ${active ? "text-[#109182]" : toolbarIconClasses(appearance)}`;

  return (
    <div
      ref={elRef}
      style={containerStyle}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <span style={{ fontWeight: 600, color: "#109182", fontSize: 14 }}>
        Eva
      </span>
      <div style={dividerStyle(appearance)} />

      <Button
        variant="ghost"
        size="icon"
        className={modeButtonClass(toolbar.mode === "annotate")}
        style={{
          borderRadius: 9999,
          ...(toolbar.mode === "annotate"
            ? { background: "rgba(16,145,130,0.12)" }
            : {}),
        }}
        title={toolbar.mode === "annotate" ? "Stop annotating" : "Annotate"}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => setMode(toolbar.mode === "annotate" ? null : "annotate")}
      >
        <IconMapPin size={18} />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className={modeButtonClass(toolbar.mode === "inspect")}
        style={{
          borderRadius: 9999,
          ...(toolbar.mode === "inspect"
            ? { background: "rgba(16,145,130,0.12)" }
            : {}),
        }}
        title={
          toolbar.mode === "inspect"
            ? "Stop inspecting"
            : "Inspect & copy element"
        }
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => setMode(toolbar.mode === "inspect" ? null : "inspect")}
      >
        <IconCrosshair size={18} />
      </Button>

      <div style={dividerStyle(appearance)} />
      <span style={{ color: toolbarMutedColor(appearance), fontSize: 13 }}>
        {pinCount} annotation{pinCount !== 1 ? "s" : ""}
      </span>
      <Button
        variant="ghost"
        size="icon"
        className={`w-8 h-8 ${ext.pinsHidden ? "text-neutral-400" : "text-[#109182]"}`}
        style={{ borderRadius: 9999 }}
        title={ext.pinsHidden ? "Show annotations" : "Hide annotations"}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => togglePinsHidden()}
      >
        {ext.pinsHidden ? <IconEyeOff size={18} /> : <IconEye size={18} />}
      </Button>
      <div style={dividerStyle(appearance)} />

      {toolbar.feedback ? (
        toolbar.feedback.action === "sign_in" ? (
          <button
            style={{
              ...feedbackStyle("error"),
              cursor: "pointer",
              border: "none",
              background: "transparent",
              textDecoration: "underline",
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => void requestBackground("OPEN_EVA", {})}
          >
            {toolbar.feedback.message}
          </button>
        ) : (
          <span style={feedbackStyle(toolbar.feedback.type)}>
            {toolbar.feedback.message}
          </span>
        )
      ) : toolbar.signedOut ? (
        <button
          style={{
            ...feedbackStyle("error"),
            cursor: "pointer",
            border: "none",
            background: "transparent",
            textDecoration: "underline",
          }}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => void requestBackground("OPEN_EVA", {})}
        >
          Sign in to Eva
        </button>
      ) : (
        <>
          <Button
            size="sm"
            className="bg-[#109182] hover:bg-[#2db8a4] text-white text-sm"
            style={{ borderRadius: 9999 }}
            disabled={actionsDisabled}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => void handleRunAll()}
          >
            Run All
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-sm"
            style={{ borderRadius: 9999 }}
            disabled={actionsDisabled}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => openProjectModal()}
          >
            Add all to a Project
          </Button>
        </>
      )}
    </div>
  );
}
