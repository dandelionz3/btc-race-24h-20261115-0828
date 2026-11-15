// Long momentum CBBTC strategy: buy after a strong 240-bar rise and manage the
// position with profit, loss, trailing drawdown, and time exits. Verified on this race's dev window.
// Dev grade (btc-race-24h-20261115-0828-dev): net PnL +7.875346 USDC, 2 trades, max drawdown 0.0047, guardrails met, action log e5e1e4abca73c2a98d1dbfe839427ddf93e263ccf64087f3b1dcb7b3cb1f9db3. Same parameters also passed the previous race's dev window (+8.767216 USDC).
// Grade locally from /home/hatch/workspace/makefun/btc-race-24h-20261115-0828-kit:
// node cli/makefun.mjs grade-local --kit . --bot /home/hatch/workspace/makefun/btc-race-24h-20261115-0828-entry --driver process
import { runBars, type BarsState, type BuyInput, type SellInput } from './vendor/makefun-bars.ts';

const closes: number[] = [];
let entryClose: number | null = null;
let peakClose: number | null = null;
let entryBar: number | null = null;
let lastSaleBar: number | null = null;

await runBars({
  onBatch(state: BarsState, batch) {
    if (state.warmingUp) return [];

    const btc = batch.bars.find((bar) => bar.symbol === 'CBBTC');
    if (!btc) return [];

    const close = Number(btc.c);
    closes.push(close);
    if (closes.length > 600) closes.shift();

    const position = state.positions.get('CBBTC');
    if (position && position.qty > 0n) {
      if (entryClose === null || peakClose === null || entryBar === null) {
        entryClose = close;
        peakClose = close;
        entryBar = state.seq;
      }

      if (close > peakClose) peakClose = close;
      const pnlBps = ((close / entryClose) - 1) * 10_000;
      const peakGainBps = ((peakClose / entryClose) - 1) * 10_000;
      const drawdownBps = ((peakClose - close) / peakClose) * 10_000;
      const age = state.seq - entryBar;
      const shouldSell = pnlBps >= 100 || pnlBps <= -60 ||
        (peakGainBps >= 50 && drawdownBps >= 80) || age >= 480;

      if (shouldSell) {
        const order: SellInput = {
          side: 'sell', symbol: 'CBBTC', qty: position.qty, max_slippage_bps: 100,
        };
        lastSaleBar = state.seq;
        entryClose = null;
        peakClose = null;
        entryBar = null;
        return [order];
      }
      return [];
    }

    const canReenter = lastSaleBar === null || state.seq - lastSaleBar >= 240;
    if (canReenter && state.cash >= 1_000_000n && closes.length >= 241) {
      const close240BarsAgo = closes[closes.length - 241];
      const rocBps = ((close / close240BarsAgo) - 1) * 10_000;
      if (rocBps >= 140) {
        const order: BuyInput = {
          side: 'buy', symbol: 'CBBTC', notional_quote_units: state.cash,
          max_slippage_bps: 100,
        };
        entryClose = close;
        peakClose = close;
        entryBar = state.seq;
        return [order];
      }
    }

    entryClose = null;
    peakClose = null;
    entryBar = null;
    return [];
  },
});
