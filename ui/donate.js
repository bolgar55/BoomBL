// ui/donate.js
// Donate button via Telegram Stars (R43, spec §Decisions 8). Entry point —
// checked manually during review, not by a unit test (interfaces.md: test
// seams). Logic: POST /api/create-invoice {amountStars} -> {invoiceUrl},
// then telegram-bridge.openInvoice(invoiceUrl).
//
// Wiring it into index.html (which element calls donate()) is task 07's
// concern — this module only exposes the function to call.

// Donation amounts in Stars — the user never specified them (spec "Open
// items"). This is a VISIBLE placeholder, not a working default: real
// amounts need to be filled in here before UI integration (task 07).
export const STARS_AMOUNTS = [/* fill in, e.g. 25, 50, 100 */];

/**
 * Creates the donate function with injectable dependencies — needed for
 * manual testing outside Telegram and for swapping fetch when necessary.
 * @param {{telegramBridge: {openInvoice: (url: string) => Promise<string>},
 *          fetchImpl?: Function,
 *          onError?: () => void}} deps
 *   telegramBridge — bridge from telegram/bridge.js (task 03), required;
 *   fetchImpl — defaults to window.fetch;
 *   onError — called when invoice creation fails (R43.1); a cancelled
 *     payment (R43.2) is NOT an error and does not call onError.
 * @returns {{donate: (amountStars: number) => Promise<void>}}
 */
export function createDonateFlow(deps = {}) {
  const telegramBridge = deps.telegramBridge;
  const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
  const onError = deps.onError ?? (() => {});

  /**
   * Starts a donation of amountStars Stars: creates an invoice on the
   * server and opens it via Telegram. Never throws outward — all failures
   * are handled gracefully (R43.1), cancellation silently (R43.2).
   */
  async function donate(amountStars) {
    let invoiceUrl;
    try {
      const response = await fetchImpl('/api/create-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amountStars }),
      });
      if (!response.ok) throw new Error('create-invoice: non-2xx response');
      const data = await response.json();
      if (!data?.invoiceUrl) throw new Error('create-invoice: missing invoiceUrl');
      invoiceUrl = data.invoiceUrl;
    } catch {
      // Failed to create the invoice — soft error, game keeps running (R43.1).
      onError();
      return;
    }

    const status = await telegramBridge.openInvoice(invoiceUrl);
    if (status === 'failed') {
      // Payment window failed to open — also a soft error (R43.1).
      onError();
    }
    // status === 'cancelled' — silently return to the game, no message (R43.2).
    // status === 'paid' / 'pending' — success/processing, no separate screen
    // needed: there's no leaderboard or payment storage (spec §Decisions 8/12).
  }

  return { donate };
}
