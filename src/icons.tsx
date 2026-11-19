// Schlanke Strich-Icons (24er Raster), Farbe über currentColor.
type P = { size?: number };

function Svg({ size = 16, children, fill }: P & { children: React.ReactNode; fill?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill ? "currentColor" : "none"}
      stroke={fill ? "none" : "currentColor"}
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function AnvilLogo({ size = 16 }: P) {
  return (
    <Svg size={size} fill>
      <path d="M3 8h4V7h14v4l-3 1H8v-1L3 10zM10 12h5v4h-5zM7 16h10l2 3H5z" />
    </Svg>
  );
}
export const PlayIcon = ({ size = 14 }: P) => (
  <Svg size={size} fill>
    <path d="M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5z" />
  </Svg>
);
export const StopIcon = ({ size = 14 }: P) => (
  <Svg size={size} fill>
    <rect x="6" y="6" width="12" height="12" rx="2" />
  </Svg>
);
export const PlusIcon = ({ size }: P) => (
  <Svg size={size}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);
export const GridIcon = ({ size }: P) => (
  <Svg size={size}>
    <rect x="4" y="4" width="7" height="7" rx="1.5" />
    <rect x="13" y="4" width="7" height="7" rx="1.5" />
    <rect x="4" y="13" width="7" height="7" rx="1.5" />
    <rect x="13" y="13" width="7" height="7" rx="1.5" />
  </Svg>
);
export const CubeIcon = ({ size }: P) => (
  <Svg size={size}>
    <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" />
    <path d="M4 7.5l8 4.5 8-4.5M12 12v9" />
  </Svg>
);
export const GearIcon = ({ size }: P) => (
  <Svg size={size}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </Svg>
);
export const HammerIcon = ({ size }: P) => (
  <Svg size={size}>
    <path d="M14 4l6 6-3 3-6-6zM11 7L3 15l3 3 8-8" />
  </Svg>
);
export const FolderIcon = ({ size }: P) => (
  <Svg size={size}>
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  </Svg>
);
export const CodeIcon = ({ size }: P) => (
  <Svg size={size}>
    <path d="M8 8l-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14" />
  </Svg>
);
export const DownloadIcon = ({ size }: P) => (
  <Svg size={size}>
    <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
  </Svg>
);
export const RefreshIcon = ({ size }: P) => (
  <Svg size={size}>
    <path d="M20 11a8 8 0 0 0-14.3-4.9L4 8M4 4v4h4M4 13a8 8 0 0 0 14.3 4.9L20 16M20 20v-4h-4" />
  </Svg>
);
export const SearchIcon = ({ size }: P) => (
  <Svg size={size}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M20 20l-4.2-4.2" />
  </Svg>
);
export const CheckIcon = ({ size }: P) => (
  <Svg size={size}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Svg>
);
export const AlertIcon = ({ size }: P) => (
  <Svg size={size}>
    <path d="M12 3l9.5 17h-19z" />
    <path d="M12 10v4M12 17.5v.01" />
  </Svg>
);
export const ChevronIcon = ({ size = 14 }: P) => (
  <Svg size={size}>
    <path d="M9 6l6 6-6 6" />
  </Svg>
);
export const TrashIcon = ({ size }: P) => (
  <Svg size={size}>
    <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
  </Svg>
);
export const TerminalIcon = ({ size }: P) => (
  <Svg size={size}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M7 9l3 3-3 3M12.5 15H17" />
  </Svg>
);
export const CloseIcon = ({ size = 12 }: P) => (
  <Svg size={size}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
);
export const MinimizeIcon = ({ size = 12 }: P) => (
  <Svg size={size}>
    <path d="M5 12h14" />
  </Svg>
);
export const MaximizeIcon = ({ size = 12 }: P) => (
  <Svg size={size}>
    <rect x="5" y="5" width="14" height="14" rx="1.5" />
  </Svg>
);
export const CoffeeIcon = ({ size }: P) => (
  <Svg size={size}>
    <path d="M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM17 10h1.5a2.5 2.5 0 0 1 0 5H17M8 3v3M12 3v3" />
  </Svg>
);
export const SparkIcon = ({ size }: P) => (
  <Svg size={size}>
    <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6" />
  </Svg>
);
export const GithubIcon = ({ size = 16 }: P) => (
  <Svg size={size} fill>
    <path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.9 1.52 2.34 1.08 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02a9.6 9.6 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.37.2 2.39.1 2.64.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10 10 0 0 0 12 2z" />
  </Svg>
);
export const RocketIcon = ({ size }: P) => (
  <Svg size={size}>
    <path d="M5 15c-1.5 1.3-2 5-2 5s3.7-.5 5-2c.7-.8.7-2-.1-2.8A2.1 2.1 0 0 0 5 15z" />
    <path d="M12 15l-3-3a22 22 0 0 1 2-4A12.9 12.9 0 0 1 22 2c0 2.7-.8 7.5-6 11a22 22 0 0 1-4 2z" />
    <path d="M9 12H4s.6-3 2-4c1.6-1.1 5 0 5 0M12 15v5s3-.6 4-2c1.1-1.6 0-5 0-5" />
  </Svg>
);
export const ShieldIcon = ({ size }: P) => (
  <Svg size={size}>
    <path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z" />
    <path d="M9 12l2 2 4-4" />
  </Svg>
);
export const CommandIcon = ({ size }: P) => (
  <Svg size={size}>
    <path d="M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3z" />
  </Svg>
);
export const PencilIcon = ({ size }: P) => (
  <Svg size={size}>
    <path d="M4 20l1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19z" />
    <path d="M14.5 6.5l3 3" />
  </Svg>
);
export const EraserIcon = ({ size }: P) => (
  <Svg size={size}>
    <path d="M8 20h12M5.5 15.5l9-9a2 2 0 0 1 2.8 0l2.2 2.2a2 2 0 0 1 0 2.8L12 19H8.5z" />
    <path d="M9.5 11.5l5 5" />
  </Svg>
);
export const BucketIcon = ({ size }: P) => (
  <Svg size={size}>
    <path d="M5 11l7-7 7 7-7 7z" />
    <path d="M5 11h14M20 15s1.5 2 1.5 3a1.5 1.5 0 0 1-3 0c0-1 1.5-3 1.5-3z" />
  </Svg>
);
export const PipetteIcon = ({ size }: P) => (
  <Svg size={size}>
    <path d="M14 7l3 3M4 20l1.5-.5L16 9l-1-1L4.5 18.5zM15 5.5l1.8-1.8a2.1 2.1 0 0 1 3 3L18 8.5z" />
  </Svg>
);
export const MirrorIcon = ({ size }: P) => (
  <Svg size={size}>
    <path d="M12 3v18M9 7L4 17h5zM15 7l5 10h-5z" />
  </Svg>
);
export const GridToggleIcon = ({ size }: P) => (
  <Svg size={size}>
    <rect x="4" y="4" width="16" height="16" rx="2" />
    <path d="M4 9.3h16M4 14.6h16M9.3 4v16M14.6 4v16" />
  </Svg>
);
export const UndoIcon = ({ size }: P) => (
  <Svg size={size}>
    <path d="M9 14L4 9l5-5" />
    <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
  </Svg>
);
export const RedoIcon = ({ size }: P) => (
  <Svg size={size}>
    <path d="M15 14l5-5-5-5" />
    <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
  </Svg>
);
export const CopyIcon = ({ size }: P) => (
  <Svg size={size}>
    <rect x="8" y="8" width="12" height="12" rx="2" />
    <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
  </Svg>
);
export const SunIcon = ({ size }: P) => (
  <Svg size={size}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </Svg>
);
export const ArrowLeftIcon = ({ size = 16 }: P) => (
  <Svg size={size}>
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </Svg>
);
export const ArrowRightIcon = ({ size = 16 }: P) => (
  <Svg size={size}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Svg>
);
export const ExternalIcon = ({ size = 16 }: P) => (
  <Svg size={size}>
    <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
  </Svg>
);
export const LogoutIcon = ({ size = 16 }: P) => (
  <Svg size={size}>
    <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l-4-4 4-4M6 12h10" />
  </Svg>
);
export const SaveIcon = ({ size = 16 }: P) => (
  <Svg size={size}>
    <path d="M5 4h11l3 3v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z" />
    <path d="M8 4v5h7V4M8 20v-6h8v6" />
  </Svg>
);
export const FileIcon = ({ size = 16 }: P) => (
  <Svg size={size}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5" />
  </Svg>
);
export const PackageIcon = ({ size = 16 }: P) => (
  <Svg size={size}>
    <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" />
    <path d="M4 7.5l8 4.5 8-4.5M12 12v9M8 5.3l8 4.5" />
  </Svg>
);
export const WrenchIcon = ({ size = 16 }: P) => (
  <Svg size={size}>
    <path d="M14.5 5.5a4 4 0 0 0 4.9 4.9l-8.6 8.6a2.1 2.1 0 0 1-3-3l8.6-8.6a4 4 0 0 0-1.9-1.9z" />
    <path d="M14.5 5.5L17 3l1.5 1.5L21 7l-2.5 2.5" />
  </Svg>
);
export const EyeIcon = ({ size = 16 }: P) => (
  <Svg size={size}>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
  </Svg>
);
export const TagIcon = ({ size = 16 }: P) => (
  <Svg size={size}>
    <path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z" />
    <circle cx="7.5" cy="7.5" r="1.5" />
  </Svg>
);
export const UserIcon = ({ size = 16 }: P) => (
  <Svg size={size}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0 1 16 0" />
  </Svg>
);
export const InfoIcon = ({ size = 16 }: P) => (
  <Svg size={size}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v6M12 7.5v.5" />
  </Svg>
);
export const PaletteIcon = ({ size = 16 }: P) => (
  <Svg size={size}>
    <path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.6-.8 1.6-1.6 0-1.3-1.1-1.5-1.1-2.7 0-1 .8-1.7 1.8-1.7H17a4 4 0 0 0 4-4c0-4.4-4-8-9-8z" />
    <circle cx="7.5" cy="11.5" r="1" />
    <circle cx="10" cy="7.5" r="1" />
    <circle cx="15" cy="7.5" r="1" />
  </Svg>
);
export const SwordIcon = ({ size = 16 }: P) => (
  <Svg size={size}>
    <path d="M14.5 17.5L3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2" />
  </Svg>
);
export const PickaxeIcon = ({ size = 16 }: P) => (
  <Svg size={size}>
    <path d="M14.5 12.5l-7.9 7.9a1 1 0 0 1-3-3l7.9-7.9M15.7 4.3A12.5 12.5 0 0 0 5.5 3a1 1 0 0 0 .1 1.7 22 22 0 0 1 6.3 3.4M17.7 3.7a1 1 0 0 0-1.4 0l-4.6 4.6a1 1 0 0 0 0 1.4l2.6 2.6a1 1 0 0 0 1.4 0l4.6-4.6a1 1 0 0 0 0-1.4zM19.7 8.3A12.5 12.5 0 0 1 21 18.5a1 1 0 0 1-1.7-.1 22 22 0 0 0-3.4-6.3" />
  </Svg>
);
export const ChestplateIcon = ({ size = 16 }: P) => (
  <Svg size={size}>
    <path d="M20.4 3.5L16 2a4 4 0 0 1-8 0L3.6 3.5a2 2 0 0 0-1.3 2.2l.6 3.5a1 1 0 0 0 1 .8H6v10a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V10h2.2a1 1 0 0 0 1-.8l.6-3.5a2 2 0 0 0-1.3-2.2z" />
  </Svg>
);
export const LayersIcon = ({ size = 16 }: P) => (
  <Svg size={size}>
    <path d="M12 3l9 5-9 5-9-5z" />
    <path d="M3 13l9 5 9-5" />
  </Svg>
);
export const GemIcon = ({ size = 16 }: P) => (
  <Svg size={size}>
    <path d="M6 3h12l4 6-10 12L2 9z" />
    <path d="M2 9h20M9 3l3 18 3-18" />
  </Svg>
);
export const GlobeIcon = ({ size = 16 }: P) => (
  <Svg size={size}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18" />
  </Svg>
);
export const ImageIcon = ({ size = 16 }: P) => (
  <Svg size={size}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <circle cx="9" cy="10" r="2" />
    <path d="M21 16l-5-5-9 9" />
  </Svg>
);
export const MoonIcon = ({ size = 16 }: P) => (
  <Svg size={size}>
    <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />
  </Svg>
);
export const UploadIcon = ({ size = 16 }: P) => (
  <Svg size={size}>
    <path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
  </Svg>
);
export const ImportIcon = ({ size = 16 }: P) => (
  <Svg size={size}>
    <path d="M12 3v12M7 10l5 5 5-5M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4" />
  </Svg>
);
export const BoxIcon = ({ size = 16 }: P) => (
  <Svg size={size}>
    <path d="M3 7l9-4 9 4v10l-9 4-9-4z" />
    <path d="M3 7l9 4 9-4M12 11v10" />
  </Svg>
);
