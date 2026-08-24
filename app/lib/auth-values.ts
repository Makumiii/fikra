export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function normalizeHandle(value: string) {
  return value.trim().replace(/^@/, "").toLowerCase();
}

export function validHandle(value: string) {
  return /^[a-z0-9_]{3,24}$/.test(value);
}
