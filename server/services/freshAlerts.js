// server/services/freshAlerts.js
// Simple alert engine — runs after each commit/recalc for a given operation.

const FreshLine  = require('../models/FreshLine');
const FreshAlert = require('../models/FreshAlert');

const DEFAULTS = {
  highRejectionRate:      0.20, // 20% of bought value rejected
  procurementShortfall:   0.20, // <80% of ordered sourced
  deliveryShortfall:      0.20, // <80% of ordered delivered
  negativeMarginThresh:   -1,
};

async function evaluateForOperation(op) {
  const alerts = [];
  const t = op.totals || {};
  const ordered = t.orderedValue || 0;
  if (ordered > 0) {
    const sourcedPct = (t.boughtValue || 0) / ordered;
    if (sourcedPct < (1 - DEFAULTS.procurementShortfall)) {
      alerts.push({
        type: 'procurement', severity: 'warning',
        message: `Only ${Math.round(sourcedPct * 100)}% of ${op.channel} order has been sourced today.`,
        metric: sourcedPct, baseline: 1 - DEFAULTS.procurementShortfall,
      });
    }
    const delPct = (t.deliveredValue || 0) / ordered;
    if (t.deliveredValue > 0 && delPct < (1 - DEFAULTS.deliveryShortfall)) {
      alerts.push({
        type: 'delivery', severity: 'warning',
        message: `${op.channel} delivered value (${Math.round(delPct * 100)}%) is significantly below ordered.`,
        metric: delPct, baseline: 1 - DEFAULTS.deliveryShortfall,
      });
    }
  }

  const lines = await FreshLine.find({ operation: op._id }).lean();
  const negatives = lines.filter((l) => Number(l.margin || 0) < DEFAULTS.negativeMarginThresh);
  for (const l of negatives) {
    alerts.push({
      type: 'negative_margin', severity: 'critical',
      productName: l.productName, branch: l.branch,
      message: `${l.productName} generated a loss of KES ${Math.abs(l.margin).toFixed(0)} today (${op.channel}).`,
      metric: l.margin, baseline: 0,
    });
  }

  const rejectByProduct = new Map();
  for (const l of lines) {
    const boughtV = Number(l.bought?.totalValue || 0);
    const rej     = Number(l.rejectedValue || 0);
    if (boughtV <= 0) continue;
    const cur = rejectByProduct.get(l.productName) || { boughtV: 0, rej: 0 };
    cur.boughtV += boughtV; cur.rej += rej;
    rejectByProduct.set(l.productName, cur);
  }
  for (const [name, r] of rejectByProduct.entries()) {
    const rate = r.rej / r.boughtV;
    if (rate > DEFAULTS.highRejectionRate) {
      alerts.push({
        type: 'high_rejection', severity: 'warning', productName: name,
        message: `${name} has a rejection rate of ${Math.round(rate * 100)}% (${op.channel}) — above threshold.`,
        metric: rate, baseline: DEFAULTS.highRejectionRate,
      });
    }
  }

  const results = [];
  for (const a of alerts) {
    const dedupeKey = `${op.dateKey}::${op.channel}::${a.type}::${a.productName || ''}::${a.branch || ''}`;
    const existing = await FreshAlert.findOne({ dedupeKey });
    if (existing) {
      existing.message = a.message; existing.metric = a.metric; existing.baseline = a.baseline;
      await existing.save();
      results.push(existing);
    } else {
      const doc = await FreshAlert.create({
        ...a, date: op.date, dateKey: op.dateKey, channel: op.channel, dedupeKey,
      });
      results.push(doc);
    }
  }
  return results;
}

module.exports = { evaluateForOperation };
