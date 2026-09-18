"use client";

import type { SVGProps } from "react";

type IconProps = {
  size?: number;
  className?: string;
};

const baseSvgProps = (
  size: number,
  className?: string,
): SVGProps<SVGSVGElement> => ({
  viewBox: "0 0 24 24",
  width: size,
  height: size,
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  xmlns: "http://www.w3.org/2000/svg",
  "aria-hidden": true,
  className: className ? `nav-icon-root ${className}` : "nav-icon-root",
});

export function ProjectsIcon({ size = 24, className }: IconProps) {
  return (
    <svg {...baseSvgProps(size, className)}>
      <rect x="3" y="3.5" width="5.5" height="17" rx="1.4" />
      <rect x="9.25" y="3.5" width="5.5" height="11" rx="1.4" />
      <rect x="15.5" y="3.5" width="5.5" height="14" rx="1.4" />
      <rect
        x="4.4"
        y="5"
        width="2.7"
        height="2.2"
        rx="0.4"
        fill="currentColor"
        stroke="none"
        className="nav-icon-card nav-icon-card-1"
      />
      <rect
        x="10.65"
        y="5"
        width="2.7"
        height="2.2"
        rx="0.4"
        fill="currentColor"
        stroke="none"
        className="nav-icon-card nav-icon-card-2"
      />
      <rect
        x="16.9"
        y="5"
        width="2.7"
        height="2.2"
        rx="0.4"
        fill="currentColor"
        stroke="none"
        className="nav-icon-card nav-icon-card-3"
      />
      <rect
        x="4.4"
        y="9"
        width="2.7"
        height="1.5"
        rx="0.4"
        fill="currentColor"
        stroke="none"
        className="nav-icon-traveler"
      />
    </svg>
  );
}

export function QuickTasksIcon({ size = 28, className }: IconProps) {
  return (
    <svg {...baseSvgProps(size, className)}>
      <rect x="3" y="4" width="6" height="6" rx="1.2" />
      <rect x="3" y="14" width="6" height="6" rx="1.2" />
      <rect
        x="3"
        y="4"
        width="6"
        height="6"
        rx="1.2"
        className="nav-icon-check-ring nav-icon-check-ring-1"
      />
      <rect
        x="3"
        y="14"
        width="6"
        height="6"
        rx="1.2"
        className="nav-icon-check-ring nav-icon-check-ring-2"
      />
      <line
        x1="11"
        y1="7"
        x2="20"
        y2="7"
        className="nav-icon-task-line nav-icon-task-line-1"
      />
      <line
        x1="11"
        y1="17"
        x2="18"
        y2="17"
        className="nav-icon-task-line nav-icon-task-line-2"
      />
      <path
        d="M4.4 7.1l1.5 1.5 2.4-2.6"
        className="nav-icon-check nav-icon-check-1"
      />
      <path
        d="M4.4 17.1l1.5 1.5 2.4-2.6"
        className="nav-icon-check nav-icon-check-2"
      />
    </svg>
  );
}

export function SessionsIcon({ size = 34, className }: IconProps) {
  return (
    <svg {...baseSvgProps(size, className)}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M7 10l3 2-3 2" className="nav-icon-prompt" />
      <rect
        x="13"
        y="13.5"
        width="1"
        height="1"
        rx="0.2"
        fill="currentColor"
        stroke="none"
        className="nav-icon-typed nav-icon-typed-1"
      />
      <rect
        x="14.6"
        y="13.5"
        width="1"
        height="1"
        rx="0.2"
        fill="currentColor"
        stroke="none"
        className="nav-icon-typed nav-icon-typed-2"
      />
      <rect
        x="16.2"
        y="13.5"
        width="1"
        height="1"
        rx="0.2"
        fill="currentColor"
        stroke="none"
        className="nav-icon-typed nav-icon-typed-3"
      />
      <rect
        x="17.8"
        y="13.2"
        width="1.4"
        height="1.6"
        rx="0.3"
        fill="currentColor"
        stroke="none"
        className="nav-icon-cursor"
      />
    </svg>
  );
}

export function DocumentsIcon({ size = 24, className }: IconProps) {
  return (
    <svg {...baseSvgProps(size, className)}>
      <path d="M14 3H7a1.5 1.5 0 0 0-1.5 1.5v15A1.5 1.5 0 0 0 7 21h11a1.5 1.5 0 0 0 1.5-1.5V8.5z" />
      <path d="M14 3v4.5a1 1 0 0 0 1 1h4.5" className="nav-icon-doc-corner" />
      <line
        x1="9"
        y1="12"
        x2="16"
        y2="12"
        className="nav-icon-doc-line nav-icon-doc-line-1"
      />
      <line
        x1="9"
        y1="15"
        x2="16"
        y2="15"
        className="nav-icon-doc-line nav-icon-doc-line-2"
      />
      <line
        x1="9"
        y1="18"
        x2="13"
        y2="18"
        className="nav-icon-doc-line nav-icon-doc-line-3"
      />
    </svg>
  );
}

export function ReviewsIcon({ size = 24, className }: IconProps) {
  return (
    <svg {...baseSvgProps(size, className)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 12.5 11.2 14.2 14.8 10" className="nav-icon-doc-line-1" />
      <path d="M8 7.5h8" className="nav-icon-doc-line-2" />
    </svg>
  );
}

export function TestingArenaIcon({ size = 24, className }: IconProps) {
  return (
    <svg {...baseSvgProps(size, className)}>
      <g className="nav-icon-flask">
        <path d="M9 3h6" />
        <path d="M10 3v6.4L5.4 18A2 2 0 0 0 7.2 21h9.6a2 2 0 0 0 1.8-3l-4.6-8.6V3" />
      </g>
      <circle
        cx="11"
        cy="17.5"
        r="0.7"
        fill="currentColor"
        stroke="none"
        className="nav-icon-bubble nav-icon-bubble-1"
      />
      <circle
        cx="13.5"
        cy="15.5"
        r="0.55"
        fill="currentColor"
        stroke="none"
        className="nav-icon-bubble nav-icon-bubble-2"
      />
      <circle
        cx="12.4"
        cy="19"
        r="0.45"
        fill="currentColor"
        stroke="none"
        className="nav-icon-bubble nav-icon-bubble-3"
      />
      <circle
        cx="14.6"
        cy="18"
        r="0.4"
        fill="currentColor"
        stroke="none"
        className="nav-icon-bubble nav-icon-bubble-4"
      />
    </svg>
  );
}

export function InboxIcon({ size = 24, className }: IconProps) {
  return (
    <svg {...baseSvgProps(size, className)}>
      <path d="M3 13.5l3-7.5h12l3 7.5v5.5A2 2 0 0 1 19 21H5a2 2 0 0 1-2-2z" />
      <path d="M3 13.5h5.2l1 2h5.6l1-2H21" />
      <g className="nav-icon-letter">
        <line x1="12" y1="2.5" x2="12" y2="8" />
        <polyline points="9.6,5.6 12,8 14.4,5.6" />
      </g>
      <circle
        cx="18.5"
        cy="4"
        r="1.4"
        fill="currentColor"
        stroke="none"
        className="nav-icon-notif"
      />
    </svg>
  );
}

export function DraftsIcon({ size = 24, className }: IconProps) {
  return (
    <svg {...baseSvgProps(size, className)}>
      {/* Document outline */}
      <path d="M14 3H7a1.5 1.5 0 0 0-1.5 1.5v15A1.5 1.5 0 0 0 7 21h11a1.5 1.5 0 0 0 1.5-1.5V8.5z" />
      <path d="M14 3v4.5a1 1 0 0 0 1 1h4.5" className="nav-icon-doc-corner" />
      {/* Pencil tip overlay — a small dashed-line pair to suggest "draft" */}
      <line
        x1="9"
        y1="12"
        x2="16"
        y2="12"
        className="nav-icon-doc-line nav-icon-doc-line-1"
      />
      <line
        x1="9"
        y1="15"
        x2="13"
        y2="15"
        className="nav-icon-doc-line nav-icon-doc-line-2"
        strokeDasharray="1.5 1.5"
      />
      {/* Pencil nib */}
      <g className="nav-icon-pencil">
        <path
          d="M16.5 16.5l1.5-1.5 1.2 1.2-1.5 1.5z"
          fill="currentColor"
          stroke="none"
        />
        <path
          d="M16.5 16.5l-0.8 2.3 2.3-0.8z"
          fill="currentColor"
          stroke="none"
        />
      </g>
    </svg>
  );
}

export function AutomationsIcon({ size = 24, className }: IconProps) {
  return (
    <svg {...baseSvgProps(size, className)}>
      <circle
        cx="12"
        cy="12"
        r="9"
        strokeDasharray="2.5 3.5"
        className="nav-icon-orbit"
      />
      <g className="nav-icon-sparks">
        <line x1="3.7" y1="3.7" x2="2.2" y2="2.2" />
        <line x1="20.3" y1="3.7" x2="21.8" y2="2.2" />
        <line x1="3.7" y1="20.3" x2="2.2" y2="21.8" />
        <line x1="20.3" y1="20.3" x2="21.8" y2="21.8" />
      </g>
      <path
        d="M10.4 8.6v6.8l5.6-3.4z"
        fill="currentColor"
        stroke="none"
        className="nav-icon-play"
      />
    </svg>
  );
}

export function StatsIcon({ size = 24, className }: IconProps) {
  return (
    <svg {...baseSvgProps(size, className)}>
      <line x1="3" y1="20" x2="21" y2="20" />
      <rect
        x="5"
        y="14"
        width="3"
        height="6"
        rx="0.5"
        fill="currentColor"
        stroke="none"
        className="nav-icon-bar nav-icon-bar-1"
      />
      <rect
        x="10.5"
        y="9"
        width="3"
        height="11"
        rx="0.5"
        fill="currentColor"
        stroke="none"
        className="nav-icon-bar nav-icon-bar-2"
      />
      <rect
        x="16"
        y="5"
        width="3"
        height="15"
        rx="0.5"
        fill="currentColor"
        stroke="none"
        className="nav-icon-bar nav-icon-bar-3"
      />
      <polyline
        points="6.5,14 12,9 17.5,5"
        strokeWidth="1.3"
        className="nav-icon-trend"
      />
    </svg>
  );
}

export function SettingsIcon({ size = 24, className }: IconProps) {
  return (
    <svg {...baseSvgProps(size, className)}>
      <g className="nav-icon-gear">
        <circle cx="12" cy="12" r="3" />
        <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 0 0-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 0 0-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 0 0-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 0 0-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 0 0 1.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065" />
      </g>
    </svg>
  );
}

export function SearchIcon({ size = 24, className }: IconProps) {
  return (
    <svg {...baseSvgProps(size, className)}>
      <g className="nav-icon-search">
        <circle cx="10.5" cy="10.5" r="6.5" />
        <line x1="15.2" y1="15.2" x2="20.5" y2="20.5" />
        <circle
          cx="8.6"
          cy="8.6"
          r="1.1"
          fill="currentColor"
          stroke="none"
          className="nav-icon-search-glint"
        />
      </g>
    </svg>
  );
}

export function SidebarCollapseIcon({
  size = 24,
  className,
  collapsed = false,
}: IconProps & { collapsed?: boolean }) {
  return (
    <svg
      {...baseSvgProps(
        size,
        collapsed
          ? className
            ? `nav-icon-sidebar-collapsed ${className}`
            : "nav-icon-sidebar-collapsed"
          : className,
      )}
    >
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <rect
        x="3.5"
        y="4.5"
        width="5.5"
        height="15"
        rx="1.2"
        fill="currentColor"
        stroke="none"
        className="nav-icon-sidebar-panel"
      />
      <path
        d={collapsed ? "M13 9l3 3-3 3" : "M16 9l-3 3 3 3"}
        className="nav-icon-sidebar-chevron"
      />
    </svg>
  );
}
