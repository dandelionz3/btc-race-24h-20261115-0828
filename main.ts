// Long-momentum on CBBTC: enter with all cash when the 240-bar close return reaches +140 bps, after a 240-bar post-sale cooldown and with at least 1,000,000 units of cash. While holding, exit at +100 bps profit, -60 bps loss, after a +50 bps peak gain followed by an 80 bps drawdown from peak, or after 480 bars; orders allow 100 bps maximum slippage.
// Verified on this race's dev window (btc-race-24h-20261115-0828-dev): net PnL +7.875346 USDC, 2 trades, max drawdown 0.0047, guardrails met, action log e5e1e4abca73c2a98d1dbfe839427ddf93e263ccf64087f3b1dcb7b3cb1f9db3. Same parameters also passed the previous race's dev window (+8.767216 USDC).
// Grade locally from /home/hatch/workspace/makefun/btc-race-24h-20261115-0828-kit:
// node cli/makefun.mjs grade-local --kit . --bot /home/hatch/workspace/makefun/btc-race-24h-20261115-0828-entry --driver process
import { runBars, type BarsState, type BuyInput, type SellInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
const MAX_SLIPPAGE_BPS = 100;
const closes: number[] = [];
let entryClose: number | null = null;
let peakClose: number | null = null;
let entryBar: number | null = null;
let lastSellBar: number | null = null;

await runBars({
  onBatch(state: BarsState, batch) {
    const bar = batch.bars.find((item) => item.symbol === SYMBOL);
    if (bar === undefined) return [];

    const close = Number(bar.c);
    closes.push(close);
    if (closes.length > 600) closes.shift();
    if (state.warmingUp) return [];

    const held = state.positions.get(SYMBOL);
    if (held !== undefined) {
      if (entryClose === null || peakClose === null || entryBar === null) {
        entryClose = close;
        peakClose = close;
        entryBar = state.seq;
      }
      peakClose = Math.max(peakClose, close);
      const pnlBps = (close / entryClose - 1) * 10_000;
      const peakGainBps = (peakClose / entryClose - 1) * 10_000;
      const drawdownBps = (peakClose - close) / peakClose * 10_000;
      const age = state.seq - entryBar;
      if (pnlBps >= 100 || pnlBps <= -60 || (peakGainBps >= 50 && drawdownBps >= 80) || age >= 480) {
        lastSellBar = state.seq;
        entryClose = null;
        peakClose = null;
        entryBar = null;
        const order: SellInput = { side: 'sell', symbol: SYMBOL, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS };
        return [order];
      }
      return [];
    }

    entryClose = null;
    peakClose = null;
    entryBar = null;
    if (closes.length < 241 || state.cash < 1_000_000n) return [];
    if (lastSellBar !== null && state.seq - lastSellBar < 240) return [];

    const priorClose = closes[closes.length - 241]!;
    const rocBps = (close / priorClose - 1) * 10_000;
    if (rocBps >= 140) {
      entryClose = close;
      peakClose = close;
      entryBar = state.seq;
      const order: BuyInput = { side: 'buy', symbol: SYMBOL, notional_quote_units: state.cash, max_slippage_bps: MAX_SLIPPAGE_BPS };
      return [order];
    }
    return [];
  },
});
