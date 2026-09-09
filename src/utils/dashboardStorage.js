export const dashboardKey = (email, section) => `solvenut:${String(email || '').trim().toLowerCase()}:${section}`;

export function readDecisions(storage, email) {
  try {
    const value = JSON.parse(storage.getItem(dashboardKey(email, 'decisions')) || '[]');
    return Array.isArray(value) ? value.filter(item => item && typeof item.title === 'string' && item.id != null) : [];
  } catch {
    return [];
  }
}
