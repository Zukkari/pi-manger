export const formatRelativeTime = (unixSec: number): string => {
  const deltaSec = Math.floor(Date.now() / 1000) - unixSec;
  if (deltaSec < 0) return 'just now';
  if (deltaSec < 60) return `${deltaSec}s ago`;
  if (deltaSec < 3600) return `${Math.floor(deltaSec / 60)}m ago`;
  if (deltaSec < 86400) return `${Math.floor(deltaSec / 3600)}h ago`;
  return `${Math.floor(deltaSec / 86400)}d ago`;
};
