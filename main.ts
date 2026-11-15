// Long momentum CBBTC strategy: buy after a strong 240-bar rise and manage the
// position with profit, loss, trailing drawdown, and time exits. Verified on this race's dev window.
// Dev grade (btc-race-24h-20261115-0828-dev): net PnL +7.875346 USDC, 2 trades, max drawdown 0.0047, guardrails met, action log e5e1e4abca73c2a98d1dbfe839427ddf93e263ccf64087f3b1dcb7b3cb1f9db3. Same parameters also passed the previous race's dev window (+8.767216 USDC).
// Grade locally from /home/hatch/workspace/makefun/btc-race-24h-20261115-0828-kit:
// node cli/makefun.mjs grade-local --kit . --bot /home/hatch/workspace/makefun/btc-race-24h-20261115-0828-entry --driver process
import { runBars, type BarsState, type BuyInput, type SellInput } from './vendor/makefun-bars.ts';

const MAX_CLOSES = 600;
const LOOKBACK_BARS = 241;
const ENTRY_ROC_BPS = 140;
const TAKE_PROFIT_BPS = 100;
const STOP_LOSS_BPS = -60;
const TRAIL_GAIN_BPS = 50;
const TRAIL_DRAWDOWN_BPS = 80;
const TIME_STOP_BARS = 480;
const COOLDOWN_BARS = 240;
const MIN_CASH_UNITS = 1000000n;
const MAX_SLIPPAGE_BPS = 100;

const recentCloses: number[] = [];
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
    recentCloses.push(close);
    if (recentCloses.length > MAX_CLOSES) recentCloses.shift();

    const position = state.positions.get('CBBTC');
    if (position && position.qty > 0n) {
      if (entryClose === null || peakClose === null || entryBar === null) {
        entryClose = close;
        peakClose = close;
        entryBar = state.seq;
      }

      peakClose = Math.max(peakClose, close);
      const pnlBps = ((close / entryClose) - 1) * 10_000;
      const peakGainBps = ((peakClose / entryClose) - 1) * 10_000;
      const drawdownBps = ((peakClose - close) / peakClose) * 10_000;
      const age = state.seq - entryBar;
      const shouldSell = pnlBps >= TAKE_PROFIT_BPS || pnlBps <= STOP_LOSS_BPS ||
        (peakGainBps >= TRAIL_GAIN_BPS && drawdownBps >= TRAIL_DRAWDOWN_BPS) || age >= TIME_STOP_BARS;

      if (shouldSell) {
        const order: SellInput = {
          side: 'sell', symbol: 'CBBTC', qty: position.qty, max_slippage_bps: MAX_SLIPPAGE_BPS,
        };
        lastSaleBar = state.seq;
        entryClose = null;
        peakClose = null;
        entryBar = null;
        return [order];
      }
      return [];
    }

    const canReenter = lastSaleBar === null || state.seq - lastSaleBar >= COOLDOWN_BARS;
    if (canReenter && state.cash >= MIN_CASH_UNITS && recentCloses.length >= LOOKBACK_BARS) {
      const close240BarsAgo = recentCloses[recentCloses.length - LOOKBACK_BARS];
      const rocBps = ((close / close240BarsAgo) - 1) * 10_000;
      if (rocBps >= ENTRY_ROC_BPS) {
        const order: BuyInput = {
          side: 'buy', symbol: 'CBBTC', notional_quote_units: state.cash,
          max_slippage_bps: MAX_SLIPPAGE_BPS,
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
