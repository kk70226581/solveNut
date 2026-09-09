export function clampFloatingRect(rect, viewport = { width: window.innerWidth, height: window.innerHeight }) {
  const margin = 8;
  const availableWidth = Math.max(1, viewport.width - margin * 2);
  const availableHeight = Math.max(1, viewport.height - margin * 2);
  const width = Math.min(Math.max(rect.width, 320), availableWidth);
  const height = Math.min(Math.max(rect.height, 260), availableHeight);
  return {
    x: Math.min(Math.max(rect.x, margin), Math.max(margin, viewport.width - width - margin)),
    y: Math.min(Math.max(rect.y, margin), Math.max(margin, viewport.height - height - margin)),
    width,
    height,
  };
}
