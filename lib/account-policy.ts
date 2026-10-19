/** Shared by account creation and login; Korean brand names are valid IDs. */
export function normalizeUsername(value: string) {
  return value.normalize('NFC').trim().toLowerCase();
}
export function validUsername(value: string) {
  return /^[a-z0-9가-힣._-]{2,40}$/.test(value);
}
/** Short test passwords are confined to the existing loopback-only local environments. */
export function minimumPasswordLength(environment: string) {
  return ['development', 'test'].includes(environment) ? 4 : 12;
}
