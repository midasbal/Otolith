const DISPLAY_DECIMALS = 4;
const MIN_DISPLAYABLE = (1 / 10 ** DISPLAY_DECIMALS).toString();

/**
 * Rounds a decimal amount string to the given number of decimal places,
 * entirely in string arithmetic. Stellar amounts carry up to 7 decimal
 * places, well past what floating point can round reliably at this scale
 * without surprises, so this never converts the value through a float.
 */
function roundDecimalString(amount: string, decimals: number): string {
  const negative = amount.trim().startsWith("-");
  const unsigned = negative ? amount.trim().slice(1) : amount.trim();
  const [intPart, fracPart = ""] = unsigned.split(".");

  if (fracPart.length <= decimals) {
    return amount;
  }

  const keep = fracPart.slice(0, decimals);
  const nextDigit = Number(fracPart[decimals]);
  const digits = `${intPart}${keep}`.split("").map(Number);

  if (nextDigit >= 5) {
    let i = digits.length - 1;
    while (i >= 0) {
      digits[i] += 1;
      if (digits[i] === 10) {
        digits[i] = 0;
        i -= 1;
      } else {
        break;
      }
    }
    if (i < 0) {
      digits.unshift(1);
    }
  }

  const digitsStr = digits.join("");
  const newIntLength = digitsStr.length - decimals;
  const newIntPart = digitsStr.slice(0, newIntLength) || "0";
  const newFracPart = digitsStr.slice(newIntLength);
  const result = newFracPart ? `${newIntPart}.${newFracPart}` : newIntPart;

  return negative ? `-${result}` : result;
}

/**
 * Formats a Stellar balance amount (a decimal string, up to 7 decimal
 * places) for display: thousands separators on the integer part, decimals
 * trimmed of trailing zeros and capped at a readable precision, and a
 * clear indicator for nonzero amounts too small to show at that
 * precision. This only ever changes how the amount is displayed; the raw
 * string passed in is never altered or returned in place of the original.
 *
 * The grouping and decimal separators are pinned to one canonical format
 * (comma thousands, period decimal) regardless of viewer locale, so the
 * instrument reads the same everywhere.
 */
export function formatBalanceAmount(rawAmount: string): string {
  const numeric = Number(rawAmount);
  if (!Number.isFinite(numeric)) {
    return rawAmount;
  }
  if (numeric === 0) {
    return "0";
  }

  const negative = numeric < 0;
  const rounded = roundDecimalString(rawAmount, DISPLAY_DECIMALS);
  const [integerPart, fracPart = ""] = rounded.replace("-", "").split(".");
  const trimmedFrac = fracPart.replace(/0+$/, "");

  if (integerPart === "0" && trimmedFrac === "") {
    return `${negative ? "-" : ""}<${MIN_DISPLAYABLE}`;
  }

  const groupedInteger = Number(integerPart).toLocaleString("en-US");
  const display = trimmedFrac ? `${groupedInteger}.${trimmedFrac}` : groupedInteger;

  return negative ? `-${display}` : display;
}

/**
 * Formats a USD amount (a plain number, already computed from oracle
 * prices, not a Stellar balance) for display: comma thousands, always
 * two decimal places, pinned to en-US regardless of viewer locale, same
 * as formatBalanceAmount's own reasoning. This is a display-only figure;
 * the number behind it never gets signed or submitted anywhere.
 */
export function formatUsd(amount: number): string {
  if (!Number.isFinite(amount)) {
    return "-";
  }
  return amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Parses a decimal amount string (up to 7 decimal places, Stellar's own
 * precision) into raw stroops as a bigint, in string arithmetic. Anchor
 * and contract amounts alike come back as decimal strings, not numbers
 * (SEP-6 amounts are strings by spec); converting through a float would
 * silently lose precision at this scale, so this never does that. Returns
 * null if the input is not a valid non-negative decimal amount.
 */
export function parseDecimalToStroops(amount: string): bigint | null {
  const trimmed = amount.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    return null;
  }

  const [intPart, fracPart = ""] = trimmed.split(".");
  if (fracPart.length > 7) {
    return null;
  }

  const paddedFrac = fracPart.padEnd(7, "0");
  try {
    return BigInt(intPart) * BigInt(10_000_000) + BigInt(paddedFrac || "0");
  } catch {
    return null;
  }
}

function pluralize(n: number, unit: string): string {
  return `${n} ${unit}${n === 1 ? "" : "s"}`;
}

/**
 * Formats a basis-points value as a percentage string (for example 250
 * bps as "2.50%"), the display form policy parameters and drift figures
 * share throughout the app.
 */
export function formatBps(bps: number): string {
  return `${(bps / 100).toFixed(2)}%`;
}

/**
 * Formats a duration in seconds as a human-readable string (for example
 * "1 hour" or "1 hour 30 minutes"), rather than the raw seconds a
 * contract stores it as. Shows at most the two largest nonzero units,
 * which is plenty of precision for a cooldown between five minutes and
 * seven days.
 */
export function formatDurationSeconds(totalSeconds: number): string {
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);

  const parts: string[] = [];
  if (days > 0) parts.push(pluralize(days, "day"));
  if (hours > 0) parts.push(pluralize(hours, "hour"));
  if (minutes > 0) parts.push(pluralize(minutes, "minute"));
  if (seconds > 0) parts.push(pluralize(seconds, "second"));

  if (parts.length === 0) {
    return "0 seconds";
  }

  return parts.slice(0, 2).join(" ");
}
