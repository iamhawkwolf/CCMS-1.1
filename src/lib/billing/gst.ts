// All amounts are integer paise. GST on services: 18% total.
// Same state as the supplier  -> CGST 9% + SGST 9%.
// Different state             -> IGST 18%.

export const GST_RATE_PERCENT = 18;

export interface GstSplit {
  subtotalPaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  totalPaise: number;
}

export function computeGst(subtotalPaise: number, supplierState: string, placeOfSupply: string, ratePercent = GST_RATE_PERCENT): GstSplit {
  if (!Number.isInteger(subtotalPaise) || subtotalPaise < 0) throw new Error("subtotalPaise must be a non-negative integer");

  const totalTax = Math.round((subtotalPaise * ratePercent) / 100);

  if (supplierState === placeOfSupply) {
    const cgst = Math.floor(totalTax / 2);
    const sgst = totalTax - cgst; // odd paisa goes to SGST so the halves always add up
    return { subtotalPaise, cgstPaise: cgst, sgstPaise: sgst, igstPaise: 0, totalPaise: subtotalPaise + cgst + sgst };
  }
  return { subtotalPaise, cgstPaise: 0, sgstPaise: 0, igstPaise: totalTax, totalPaise: subtotalPaise + totalTax };
}

export const rupeesToPaise = (rupees: number): number => Math.round(rupees * 100);

export function formatRupees(paise: number): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(paise / 100);
}

export interface LineInput {
  quantity: number;
  ratePaise: number;
}

export const lineAmountPaise = (l: LineInput): number => Math.round(l.quantity * l.ratePaise);

/** Per-head billing: headcount x rate per head. */
export const perHeadAmountPaise = (heads: number, ratePerHeadPaise: number): number => heads * ratePerHeadPaise;

/** Hourly billing from tracked minutes, rounded to the nearest paisa. */
export const hourlyAmountPaise = (minutes: number, ratePerHourPaise: number): number => Math.round((minutes / 60) * ratePerHourPaise);

/** Financial year invoice numbers like INV/2026-27/0001 (FY runs April to March). */
export function invoiceNumber(prefix: string, seq: number, on: Date): string {
  const y = on.getUTCFullYear();
  const startYear = on.getUTCMonth() >= 3 ? y : y - 1;
  const fy = `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
  return `${prefix}/${fy}/${String(seq).padStart(4, "0")}`;
}
