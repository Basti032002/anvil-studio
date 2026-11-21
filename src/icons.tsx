// Icons: Phosphor (Bold) – klare, gleichmäßige Linien in der Textfarbe.
import {
  Bell,
  Star,
  Storefront,
  Hash,
  Graph,
  GitFork,
  Hourglass,
  Repeat,
  CloudLightning,
  ChatText,
  Hamburger,
  Shovel,
  Prohibit,
  MagnifyingGlassPlus,
  MagnifyingGlassMinus,
  CornersOut,
  ArrowClockwise,
  ArrowCounterClockwise,
  ArrowLeft,
  ArrowRight,
  ArrowSquareOut,
  ArrowsClockwise,
  ArrowsLeftRight,
  Axe,
  Broom,
  CaretRight,
  CheckCircle,
  ClipboardText,
  Code,
  Coffee,
  Command,
  Copy,
  Cube,
  Cursor,
  Diamond,
  DownloadSimple,
  Egg,
  Eraser,
  Eye,
  Eyedropper,
  File,
  FilePlus,
  FlipHorizontal,
  FloppyDisk,
  FolderOpen,
  FolderSimple,
  FolderSimplePlus,
  Gear,
  GithubLogo,
  GlobeHemisphereWest,
  GridFour,
  Hammer,
  Heart,
  Image,
  Info,
  MagnifyingGlass,
  Moon,
  Mountains,
  Package,
  PaintBucket,
  Palette,
  PawPrint,
  PencilSimple,
  Play,
  Plus,
  RocketLaunch,
  Scissors,
  ShieldCheck,
  SignOut,
  Skull,
  Sparkle,
  SquaresFour,
  StackSimple,
  Stop,
  Sun,
  Sword,
  TShirt,
  Tag,
  TerminalWindow,
  TextAa,
  ToggleRight,
  Translate,
  Trash,
  TrayArrowDown,
  UploadSimple,
  User,
  WarningCircle,
  Wrench,
  X,
  Minus,
  Square,
  Lightning,
  Lamp,
  Archive,
  Flask,
  BracketsCurly,
  AppWindow,
  LineSegment,
  Circle,
  Gradient,
  DotsNine,
  EyeSlash,
  Selection,
  ArrowsOutCardinal,
  FilmStrip,
  Pause,
} from "@phosphor-icons/react";

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
export const PlayIcon = ({ size = 14 }: P) => <Play size={size} weight="bold" aria-hidden="true" />;
export const StopIcon = ({ size = 14 }: P) => <Stop size={size} weight="bold" aria-hidden="true" />;
export const PlusIcon = ({ size = 16 }: P) => <Plus size={size} weight="bold" aria-hidden="true" />;
export const GridIcon = ({ size = 18 }: P) => <SquaresFour size={size} weight="bold" aria-hidden="true" />;
export const CubeIcon = ({ size = 16 }: P) => <Cube size={size} weight="bold" aria-hidden="true" />;
export const GearIcon = ({ size = 18 }: P) => <Gear size={size} weight="bold" aria-hidden="true" />;
export const HammerIcon = ({ size = 16 }: P) => <Hammer size={size} weight="bold" aria-hidden="true" />;
export const FolderIcon = ({ size = 16 }: P) => <FolderSimple size={size} weight="bold" aria-hidden="true" />;
export const CodeIcon = ({ size = 16 }: P) => <Code size={size} weight="bold" aria-hidden="true" />;
export const DownloadIcon = ({ size = 16 }: P) => <DownloadSimple size={size} weight="bold" aria-hidden="true" />;
export const RefreshIcon = ({ size = 16 }: P) => <ArrowsClockwise size={size} weight="bold" aria-hidden="true" />;
export const SearchIcon = ({ size = 14 }: P) => <MagnifyingGlass size={size} weight="bold" aria-hidden="true" />;
export const CheckIcon = ({ size = 16 }: P) => <CheckCircle size={size} weight="bold" aria-hidden="true" />;
export const AlertIcon = ({ size = 16 }: P) => <WarningCircle size={size} weight="bold" aria-hidden="true" />;
export const ChevronIcon = ({ size = 14 }: P) => <CaretRight size={size} weight="bold" aria-hidden="true" />;
export const TrashIcon = ({ size = 16 }: P) => <Trash size={size} weight="bold" aria-hidden="true" />;
export const TerminalIcon = ({ size = 16 }: P) => <TerminalWindow size={size} weight="bold" aria-hidden="true" />;
export const CloseIcon = ({ size = 14 }: P) => <X size={size} weight="bold" aria-hidden="true" />;
export const CoffeeIcon = ({ size = 16 }: P) => <Coffee size={size} weight="bold" aria-hidden="true" />;
export const SparkIcon = ({ size = 16 }: P) => <Sparkle size={size} weight="bold" aria-hidden="true" />;
export const GithubIcon = ({ size = 16 }: P) => <GithubLogo size={size} weight="bold" aria-hidden="true" />;
export const RocketIcon = ({ size = 16 }: P) => <RocketLaunch size={size} weight="bold" aria-hidden="true" />;
export const ShieldIcon = ({ size = 18 }: P) => <ShieldCheck size={size} weight="bold" aria-hidden="true" />;
export const CommandIcon = ({ size = 14 }: P) => <Command size={size} weight="bold" aria-hidden="true" />;
export const PencilIcon = ({ size = 16 }: P) => <PencilSimple size={size} weight="bold" aria-hidden="true" />;
export const EraserIcon = ({ size = 16 }: P) => <Eraser size={size} weight="bold" aria-hidden="true" />;
export const BucketIcon = ({ size = 16 }: P) => <PaintBucket size={size} weight="bold" aria-hidden="true" />;
export const PipetteIcon = ({ size = 16 }: P) => <Eyedropper size={size} weight="bold" aria-hidden="true" />;
export const MirrorIcon = ({ size = 16 }: P) => <FlipHorizontal size={size} weight="bold" aria-hidden="true" />;
export const GridToggleIcon = ({ size = 16 }: P) => <GridFour size={size} weight="bold" aria-hidden="true" />;
export const UndoIcon = ({ size = 16 }: P) => <ArrowCounterClockwise size={size} weight="bold" aria-hidden="true" />;
export const RedoIcon = ({ size = 16 }: P) => <ArrowClockwise size={size} weight="bold" aria-hidden="true" />;
export const CopyIcon = ({ size = 16 }: P) => <Copy size={size} weight="bold" aria-hidden="true" />;
export const SunIcon = ({ size = 16 }: P) => <Sun size={size} weight="bold" aria-hidden="true" />;
export const ArrowLeftIcon = ({ size = 16 }: P) => <ArrowLeft size={size} weight="bold" aria-hidden="true" />;
export const ArrowRightIcon = ({ size = 16 }: P) => <ArrowRight size={size} weight="bold" aria-hidden="true" />;
export const ExternalIcon = ({ size = 16 }: P) => <ArrowSquareOut size={size} weight="bold" aria-hidden="true" />;
export const LogoutIcon = ({ size = 16 }: P) => <SignOut size={size} weight="bold" aria-hidden="true" />;
export const SaveIcon = ({ size = 16 }: P) => <FloppyDisk size={size} weight="bold" aria-hidden="true" />;
export const FileIcon = ({ size = 16 }: P) => <File size={size} weight="bold" aria-hidden="true" />;
export const PackageIcon = ({ size = 16 }: P) => <Package size={size} weight="bold" aria-hidden="true" />;
export const WrenchIcon = ({ size = 16 }: P) => <Wrench size={size} weight="bold" aria-hidden="true" />;
export const EyeIcon = ({ size = 16 }: P) => <Eye size={size} weight="bold" aria-hidden="true" />;
export const TagIcon = ({ size = 16 }: P) => <Tag size={size} weight="bold" aria-hidden="true" />;
export const UserIcon = ({ size = 16 }: P) => <User size={size} weight="bold" aria-hidden="true" />;
export const InfoIcon = ({ size = 16 }: P) => <Info size={size} weight="bold" aria-hidden="true" />;
export const PaletteIcon = ({ size = 16 }: P) => <Palette size={size} weight="bold" aria-hidden="true" />;
export const SwordIcon = ({ size = 16 }: P) => <Sword size={size} weight="bold" aria-hidden="true" />;
export const PickaxeIcon = ({ size = 16 }: P) => <Axe size={size} weight="bold" aria-hidden="true" />;
export const ChestplateIcon = ({ size = 16 }: P) => <TShirt size={size} weight="bold" aria-hidden="true" />;
export const LayersIcon = ({ size = 16 }: P) => <StackSimple size={size} weight="bold" aria-hidden="true" />;
export const GemIcon = ({ size = 16 }: P) => <Diamond size={size} weight="bold" aria-hidden="true" />;
export const GlobeIcon = ({ size = 16 }: P) => <GlobeHemisphereWest size={size} weight="bold" aria-hidden="true" />;
export const ImageIcon = ({ size = 16 }: P) => <Image size={size} weight="bold" aria-hidden="true" />;
export const MoonIcon = ({ size = 16 }: P) => <Moon size={size} weight="bold" aria-hidden="true" />;
export const UploadIcon = ({ size = 16 }: P) => <UploadSimple size={size} weight="bold" aria-hidden="true" />;
export const ImportIcon = ({ size = 16 }: P) => <TrayArrowDown size={size} weight="bold" aria-hidden="true" />;
export const BoxIcon = ({ size = 16 }: P) => <Package size={size} weight="bold" aria-hidden="true" />;
export const SkullIcon = ({ size = 16 }: P) => <Skull size={size} weight="bold" aria-hidden="true" />;
export const PawIcon = ({ size = 16 }: P) => <PawPrint size={size} weight="bold" aria-hidden="true" />;
export const TranslateIcon = ({ size = 16 }: P) => <Translate size={size} weight="bold" aria-hidden="true" />;
export const SwapIcon = ({ size = 16 }: P) => <ArrowsLeftRight size={size} weight="bold" aria-hidden="true" />;
export const ScissorsIcon = ({ size = 16 }: P) => <Scissors size={size} weight="bold" aria-hidden="true" />;
export const ClipboardIcon = ({ size = 16 }: P) => <ClipboardText size={size} weight="bold" aria-hidden="true" />;
export const SelectAllIcon = ({ size = 16 }: P) => <TextAa size={size} weight="bold" aria-hidden="true" />;
export const FolderOpenIcon = ({ size = 16 }: P) => <FolderOpen size={size} weight="bold" aria-hidden="true" />;
export const FilePlusIcon = ({ size = 16 }: P) => <FilePlus size={size} weight="bold" aria-hidden="true" />;
export const FolderPlusIcon = ({ size = 16 }: P) => <FolderSimplePlus size={size} weight="bold" aria-hidden="true" />;
export const ToggleIcon = ({ size = 16 }: P) => <ToggleRight size={size} weight="bold" aria-hidden="true" />;
export const EggIcon = ({ size = 16 }: P) => <Egg size={size} weight="bold" aria-hidden="true" />;
export const CursorIcon = ({ size = 16 }: P) => <Cursor size={size} weight="bold" aria-hidden="true" />;
export const BroomIcon = ({ size = 16 }: P) => <Broom size={size} weight="bold" aria-hidden="true" />;
export const TShirtIcon = ({ size = 16 }: P) => <TShirt size={size} weight="bold" aria-hidden="true" />;
export const MountainsIcon = ({ size = 16 }: P) => <Mountains size={size} weight="bold" aria-hidden="true" />;
export const MinimizeIcon = ({ size = 12 }: P) => <Minus size={size} weight="regular" aria-hidden="true" />;
export const MaximizeIcon = ({ size = 12 }: P) => <Square size={size} weight="regular" aria-hidden="true" />;
export const HeartIcon = ({ size = 16 }: P) => <Heart size={size} weight="bold" aria-hidden="true" />;
export const LightningIcon = ({ size = 16 }: P) => <Lightning size={size} weight="bold" aria-hidden="true" />;
export const LampIcon = ({ size = 16 }: P) => <Lamp size={size} weight="bold" aria-hidden="true" />;
export const ChestIcon = ({ size = 16 }: P) => <Archive size={size} weight="bold" aria-hidden="true" />;
export const FlaskIcon = ({ size = 16 }: P) => <Flask size={size} weight="bold" aria-hidden="true" />;
export const BlueprintIcon = ({ size = 16 }: P) => <Graph size={size} weight="bold" aria-hidden="true" />;
export const BranchIcon = ({ size = 16 }: P) => <GitFork size={size} weight="bold" aria-hidden="true" />;
export const DelayIcon = ({ size = 16 }: P) => <Hourglass size={size} weight="bold" aria-hidden="true" />;
export const RepeatIcon = ({ size = 16 }: P) => <Repeat size={size} weight="bold" aria-hidden="true" />;
export const WeatherIcon = ({ size = 16 }: P) => <CloudLightning size={size} weight="bold" aria-hidden="true" />;
export const ChatIcon = ({ size = 16 }: P) => <ChatText size={size} weight="bold" aria-hidden="true" />;
export const FoodIcon = ({ size = 16 }: P) => <Hamburger size={size} weight="bold" aria-hidden="true" />;
export const ShovelIcon = ({ size = 16 }: P) => <Shovel size={size} weight="bold" aria-hidden="true" />;
export const CancelIcon = ({ size = 16 }: P) => <Prohibit size={size} weight="bold" aria-hidden="true" />;
export const ZoomInIcon = ({ size = 16 }: P) => <MagnifyingGlassPlus size={size} weight="bold" aria-hidden="true" />;
export const ZoomOutIcon = ({ size = 16 }: P) => <MagnifyingGlassMinus size={size} weight="bold" aria-hidden="true" />;
export const FitIcon = ({ size = 16 }: P) => <CornersOut size={size} weight="bold" aria-hidden="true" />;
export const VarIcon = ({ size = 16 }: P) => <Hash size={size} weight="bold" aria-hidden="true" />;
export const WorkshopIcon = ({ size = 16 }: P) => <Storefront size={size} weight="bold" aria-hidden="true" />;
export const StarIcon = ({ size = 16 }: P) => <Star size={size} weight="bold" aria-hidden="true" />;
export const StarFillIcon = ({ size = 16 }: P) => <Star size={size} weight="fill" aria-hidden="true" />;
export const BellIcon = ({ size = 16 }: P) => <Bell size={size} weight="bold" aria-hidden="true" />;

export const VariableIcon = ({ size = 16 }: P) => <BracketsCurly size={size} weight="bold" aria-hidden="true" />;
export const GuiIcon = ({ size = 16 }: P) => <AppWindow size={size} weight="bold" aria-hidden="true" />;
export const LineIcon = ({ size = 16 }: P) => <LineSegment size={size} weight="bold" aria-hidden="true" />;
export const RectIcon = ({ size = 16 }: P) => <Square size={size} weight="bold" aria-hidden="true" />;
export const CircleIcon = ({ size = 16 }: P) => <Circle size={size} weight="bold" aria-hidden="true" />;
export const GradientIcon = ({ size = 16 }: P) => <Gradient size={size} weight="bold" aria-hidden="true" />;
export const NoiseIcon = ({ size = 16 }: P) => <DotsNine size={size} weight="bold" aria-hidden="true" />;
export const EyeOffIcon = ({ size = 16 }: P) => <EyeSlash size={size} weight="bold" aria-hidden="true" />;
export const SelectIcon = ({ size = 16 }: P) => <Selection size={size} weight="bold" aria-hidden="true" />;
export const MoveIcon = ({ size = 16 }: P) => <ArrowsOutCardinal size={size} weight="bold" aria-hidden="true" />;
export const FramesIcon = ({ size = 16 }: P) => <FilmStrip size={size} weight="bold" aria-hidden="true" />;
export const PauseIcon = ({ size = 16 }: P) => <Pause size={size} weight="bold" aria-hidden="true" />;
