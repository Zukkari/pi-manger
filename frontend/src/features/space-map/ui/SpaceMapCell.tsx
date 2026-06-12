import { formatBytes } from '@/shared/lib/formatBytes';

interface SpaceMapCellProps {
  // All props are injected by recharts via cloneElement, so they arrive untyped
  // and potentially absent — hence everything is optional with safe defaults.
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  depth?: number;
  name?: string;
  fill?: string;
  id?: number;
  is_dir?: boolean;
  total_bytes?: number;
}

const DARK_LABEL = '#10182e';
const LIGHT_LABEL = '#f5f8ff';

// Palette fills span dark teal to bright amber across both theme modes, so a
// single hardcoded label color would be unreadable on half of them.
const labelColorFor = (fillHex: string): string => {
  const hex = fillHex.replace('#', '');
  if (hex.length !== 6) return LIGHT_LABEL;
  const [r, g, b] = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.55 ? DARK_LABEL : LIGHT_LABEL;
};

const MIN_LABEL_WIDTH = 44;
const MIN_LABEL_HEIGHT = 28;
const MIN_TWO_LINE_HEIGHT = 44;
const PADDING = 8;

export const SpaceMapCell = ({
  x = 0,
  y = 0,
  width = 0,
  height = 0,
  depth,
  name = '',
  fill = '#888888',
  id,
  is_dir = false,
  total_bytes = 0,
}: SpaceMapCellProps) => {
  // recharts also invokes content for the synthetic root node (depth 0), which
  // spans the whole chart — rendering it would paint over every child block.
  if (depth !== 1) return null;

  const showLabel = width >= MIN_LABEL_WIDTH && height >= MIN_LABEL_HEIGHT;
  const showSize = showLabel && height >= MIN_TWO_LINE_HEIGHT;
  const labelColor = labelColorFor(fill);
  const clipId = `space-map-cell-clip-${id ?? 'unknown'}`;

  return (
    <g style={is_dir ? { cursor: 'pointer' } : undefined}>
      <clipPath id={clipId}>
        <rect x={x + 2} y={y + 2} width={Math.max(width - PADDING, 0)} height={height} />
      </clipPath>
      <rect
        x={x + 1}
        y={y + 1}
        width={Math.max(width - 2, 0)}
        height={Math.max(height - 2, 0)}
        rx={6}
        fill={fill}
      />
      {showLabel && (
        <text
          x={x + PADDING}
          y={y + PADDING + 11}
          clipPath={`url(#${clipId})`}
          fill={labelColor}
          fontSize={11}
          fontWeight={600}
          fontFamily="var(--font-ui, sans-serif)"
        >
          {name}
        </text>
      )}
      {showSize && (
        <text
          x={x + PADDING}
          y={y + PADDING + 26}
          clipPath={`url(#${clipId})`}
          fill={labelColor}
          fillOpacity={0.75}
          fontSize={10}
          fontFamily="var(--font-data, monospace)"
        >
          {formatBytes(total_bytes)}
        </text>
      )}
    </g>
  );
};
