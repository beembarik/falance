const supportedCurrencyCodes = new Set(Intl.supportedValuesOf("currency"));

export const DEFAULT_CURRENCY_CODE = "IDR";

export function isSupportedCurrencyCode(value: string): boolean {
  return /^[A-Z]{3}$/.test(value) && supportedCurrencyCodes.has(value);
}
