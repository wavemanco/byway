/** Sample diffs for demo runs of Lean Code Review: each version is smaller than the one before. */

const HEADER = `diff --git a/src/cart/total.ts b/src/cart/total.ts
index 4b1c2d0..9e8f7a1 100644
--- a/src/cart/total.ts
+++ b/src/cart/total.ts`;

/** The agent's first implementation: a debug flag, a TODO and an unrequested helper. */
export const DIFF_IMPLEMENT = `${HEADER}
@@ -1,7 +1,21 @@
 import type { LineItem } from './types.ts';

+// TODO: remove debug flag before release
+const DEBUG_TOTALS = false;
+
+/** Formats a number of cents as a currency string for logging. */
+export function formatCentsForLog(cents: number): string {
+  return (cents / 100).toFixed(2);
+}
+
 export function cartTotal(items: LineItem[]): number {
-  let total = 0;
-  for (const item of items) total += item.price * item.quantity;
-  return total;
+  // Calculate the total by summing price times quantity for each item in the cart.
+  const totalCents = items.reduce((sum, item) => {
+    const line = item.priceCents * item.quantity;
+    if (DEBUG_TOTALS) console.log('line', formatCentsForLog(line));
+    return sum + line;
+  }, 0);
+  // Apply the discount if one is present on any item.
+  const discount = items.some((i) => i.discountCents) ? items.reduce((d, i) => d + (i.discountCents ?? 0), 0) : 0;
+  return Math.max(0, totalCents - discount);
 }
`;

/** After the scope trim: the helper and the debug flag are gone. */
export const DIFF_SCOPED = `${HEADER}
@@ -1,7 +1,9 @@
 import type { LineItem } from './types.ts';

 export function cartTotal(items: LineItem[]): number {
-  let total = 0;
-  for (const item of items) total += item.price * item.quantity;
-  return total;
+  // Calculate the total by summing price times quantity for each item in the cart.
+  const totalCents = items.reduce((sum, item) => sum + item.priceCents * item.quantity, 0);
+  // Apply the discount if one is present on any item.
+  const discount = items.some((i) => i.discountCents) ? items.reduce((d, i) => d + (i.discountCents ?? 0), 0) : 0;
+  return Math.max(0, totalCents - discount);
 }
`;

/** After review and the second trim: narrating comments and the redundant check are gone. */
export const DIFF_REVIEWED = `${HEADER}
@@ -1,7 +1,7 @@
 import type { LineItem } from './types.ts';

 export function cartTotal(items: LineItem[]): number {
-  let total = 0;
-  for (const item of items) total += item.price * item.quantity;
-  return total;
+  const totalCents = items.reduce((sum, item) => sum + item.priceCents * item.quantity, 0);
+  const discount = items.reduce((d, item) => d + (item.discountCents ?? 0), 0);
+  return Math.max(0, totalCents - discount);
 }
`;

/** After the cliché sweep: a clearer name for the accumulator. */
export const DIFF_SWEPT = DIFF_REVIEWED.replace('(d, item) => d + (item', '(total, item) => total + (item');

export const WHY_DRAFT = 'Why: Cart totals now work in cents and subtract item discounts, so totals match the receipt.';
