/**
 * Normalises an Indian phone number to the form the WhatsApp API wants: digits only, with country code, no "+".
 * Returns null when it cannot be a valid Indian mobile number.
 *   "+91 98765-43210" -> "919876543210"      "09876543210" -> "919876543210"      "9876543210" -> "919876543210"
 */
export function toWhatsAppNumber(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let d = raw.replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  if (d.length === 10) d = "91" + d;
  if (!/^91[6-9]\d{9}$/.test(d)) return null;
  return d;
}
