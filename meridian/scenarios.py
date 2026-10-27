"""Business scenarios from the fitted Meridian model (run after train_meridian.py).

Answers, for the analysis window (3 Apr 2026 + 20 weeks), expressed per month:
1. How much can the budget be cut while keeping incremental revenue flat (0% growth)?
2. What happens to revenue if the budget is cut 10%?
3. How much budget is needed for +10% incremental revenue?
4. Fixed budget: optimal allocation, incremental revenue and ROAS (budget frontier -30% up to Rp10B/month).
5. Maximum ROAS at a fixed budget, and Meridian's flexible-budget scenario (target mROI = 1).

All optimizations run a dynamic program on Meridian's response grid (BudgetOptimizer grid, posterior mean)
with Meridian's default per-channel spend constraints: each channel stays between (1 - 30%) and (1 + 30%)
of budget x its historical share (`spend_constraint_lower/upper` = 0.3, Meridian's fixed-budget default).
The flexible-budget scenario uses Meridian's flexible default (0% to 200% of current spend).
Budgets go up to Rp10B per month, the planning range covered by the training data.

Results are added to app/data/meridian_output.json under "scenarios".
"""

from pathlib import Path
import json
import os
import sys
import warnings

os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "3")
warnings.filterwarnings("ignore")

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import numpy as np  # noqa: E402

from meridian.analysis import optimizer  # noqa: E402
from meridian.model import model  # noqa: E402

from app.data.master import DAYS_PER_MONTH  # noqa: E402
from app.data.meridian_input import HISTORY_WEEKS  # noqa: E402

MODEL_PATH = ROOT / "meridian" / "output" / "xl_meridian_model.pkl"
OUTPUT_PATH = ROOT / "app" / "data" / "meridian_output.json"
MONEY = 1e6
MAX_CUT = 0.30       # per-channel floor: -30% of the channel's share (Meridian default)
MAX_INCREASE = 0.30  # per-channel cap: +30% of the channel's share (Meridian default)
PLANNING_CAP_MONTHLY = 10e9  # IDR per month
FRONTIER = [round(x, 2) for x in np.arange(-0.30, 0.601, 0.05)] + [0.7, 0.8, 0.9, 1.0, 1.2, 1.4]


class Scenarios:
    def __init__(self, mmm):
        self.mmm = mmm
        times = [str(t) for t in mmm.input_data.time.values]
        self.window = times[HISTORY_WEEKS:]
        self.months = len(self.window) * 7 / DAYS_PER_MONTH
        budget_optimizer = optimizer.BudgetOptimizer(mmm)
        # One grid from 0% to 330% of current spend per channel (covers +30% of the share at Rp10B/month); every scenario trims it.
        self.grid = budget_optimizer.create_optimization_grid(
            selected_times=(self.window[0], self.window[-1]), spend_constraint_lower=1.0, spend_constraint_upper=2.3, gtol=1e-4
        )
        self.channels = list(self.grid.channels)
        self.current = np.asarray(self.grid.historical_spend, dtype=float)
        self.budget0 = float(self.current.sum())
        spend_grid = np.asarray(self.grid.spend_grid, dtype=float)
        outcome_grid = np.asarray(self.grid.incremental_outcome_grid, dtype=float)
        steps = np.diff(spend_grid[:, 0])
        self.step = float(np.nanmin(steps[steps > 0]))
        self.curves = []
        for index in range(len(self.channels)):
            valid = ~np.isnan(spend_grid[:, index]) & ~np.isnan(outcome_grid[:, index])
            order = np.argsort(spend_grid[valid, index])
            self.curves.append((spend_grid[valid, index][order], outcome_grid[valid, index][order]))
        kpi = mmm.input_data.kpi.sel(time=self.window).values
        self.total_revenue = float(np.sum(kpi))
        self.incr0 = self.incremental(self.current)

    def incremental_by_channel(self, allocation):
        return np.array([np.interp(spend, xs, ys) for spend, (xs, ys) in zip(allocation, self.curves)])

    def incremental(self, allocation):
        return float(self.incremental_by_channel(allocation).sum())

    def _channel_grid(self, index):
        """Spend steps (IDR M) and posterior-mean incremental outcome for one channel."""
        xs, ys = self.curves[index]
        return xs, ys

    def _bounds(self, budget=None):
        """Meridian rule: (1 - lower) x budget x share .. (1 + upper) x budget x share."""
        scale = 1.0 if budget is None else budget / self.budget0
        return [((1 - MAX_CUT) * cur * scale, (1 + MAX_INCREASE) * cur * scale) for cur in self.current]

    def optimal(self, change):
        """Best allocation at budget = current x (1 + change), by dynamic programming on the
        Meridian response grid (exact for any curve shape; Meridian's built-in greedy grid search
        assumes diminishing returns and is unreliable while curves are still S-shaped)."""
        budget = self.budget0 * (1 + change)
        step = self.step
        total = int(round(budget / step))
        value = np.full(total + 1, -np.inf)
        value[0] = 0.0
        choices = []
        for index, (lo, hi) in enumerate(self._bounds(budget)):
            xs, ys = self._channel_grid(index)
            lo_i, hi_i = int(np.ceil(lo / step - 1e-9)), int(np.floor(hi / step + 1e-9))
            outcome = np.interp(np.arange(hi_i + 1) * step, xs, ys)
            new_value = np.full(total + 1, -np.inf)
            pick = np.zeros(total + 1, dtype=int)
            for k in range(lo_i, min(hi_i, total) + 1):
                candidate = value[: total + 1 - k] + outcome[k]
                better = candidate > new_value[k:]
                new_value[k:][better] = candidate[better]
                pick[k:][better] = k
            choices.append(pick)
            value = new_value
        if not np.isfinite(value[total]):
            raise ValueError(f"no feasible allocation at budget change {change:+.3f}")
        allocation = np.zeros(len(self.channels))
        remaining = total
        for index in range(len(self.channels) - 1, -1, -1):
            k = choices[index][remaining]
            allocation[index] = k * step
            remaining -= k
        return allocation

    def cap_change(self):
        """Budget change that reaches the Rp10B/month planning cap."""
        return PLANNING_CAP_MONTHLY / self.monthly(self.budget0) - 1

    def flexible_mroi(self, target=1.0):
        """Meridian-style flexible budget: each channel spends while the next Rp1 returns at least
        `target`, within Meridian's flexible-budget default constraints (0% to 200% of current spend);
        maximizes incremental revenue - target x spend."""
        allocation = []
        for index, (lo, hi) in enumerate([(0.0, 2.0 * cur) for cur in self.current]):
            xs, ys = self._channel_grid(index)
            grid = np.arange(lo, hi + self.step / 2, self.step)
            gain = np.interp(grid, xs, ys) - target * grid
            allocation.append(float(grid[int(np.argmax(gain))]))
        return np.array(allocation)

    def search(self, target, low, high, steps=24):
        """Smallest budget change in [low, high] whose optimal incremental >= target (monotone)."""
        if self.incremental(self.optimal(high)) < target:
            return None
        for _ in range(steps):
            mid = (low + high) / 2
            if self.incremental(self.optimal(mid)) >= target:
                high = mid
            else:
                low = mid
        return high

    # ---- reporting helpers (monthly IDR) ----
    def monthly(self, value):
        return value * MONEY / self.months

    def describe(self, label, allocation, note=""):
        by_channel = self.incremental_by_channel(allocation)
        budget = float(allocation.sum())
        incr = float(by_channel.sum())
        return {
            "label": label,
            "note": note,
            "budgetChangePct": (budget / self.budget0 - 1) * 100,
            "budgetMonthly": self.monthly(budget),
            "incrementalMonthly": self.monthly(incr),
            "incrementalChangePct": (incr / self.incr0 - 1) * 100,
            "totalRevenueMonthly": self.monthly(self.total_revenue - self.incr0 + incr),
            "totalRevenueChangePct": (incr - self.incr0) / self.total_revenue * 100,
            "roas": incr / budget if budget else 0,
            "channels": {
                channel: {
                    "currentMonthly": self.monthly(self.current[i]),
                    "budgetMonthly": self.monthly(allocation[i]),
                    "changePct": (allocation[i] / self.current[i] - 1) * 100,
                    "incrementalMonthly": self.monthly(by_channel[i]),
                }
                for i, channel in enumerate(self.channels)
            },
        }


def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--model-path", type=Path, default=MODEL_PATH)
    parser.add_argument("--output", type=Path, default=OUTPUT_PATH)
    args = parser.parse_args()
    mmm = model.load_mmm(str(args.model_path))
    s = Scenarios(mmm)
    current = s.describe("Current budget and mix", s.current)
    print(f"current: budget {current['budgetMonthly'] / 1e9:.2f}B/mo, incremental {current['incrementalMonthly'] / 1e9:.2f}B/mo, ROAS {current['roas']:.2f}")

    frontier = []
    for change in FRONTIER:
        optimal = s.describe(f"Optimal mix at {change * 100:+.0f}% budget", s.optimal(change))
        proportional = s.describe(f"Same mix at {change * 100:+.0f}% budget", s.current * (1 + change))
        frontier.append({"budgetChangePct": change * 100, "optimal": optimal, "proportional": proportional})
        print(f"{change * 100:+5.0f}%  optimal incr {optimal['incrementalChangePct']:+6.2f}%  ROAS {optimal['roas']:.2f}  | same mix {proportional['incrementalChangePct']:+6.2f}%")

    flat = s.search(s.incr0, -MAX_CUT, 0.0)
    q1 = s.describe("Lowest budget that keeps incremental revenue flat", s.optimal(flat), "Reallocation within ±30% of each channel's share (Meridian default)") if flat is not None else None

    cut10_optimal = s.describe("Budget -10%, optimal mix", s.optimal(-0.10))
    cut10_same = s.describe("Budget -10%, same mix (every channel -10%)", s.current * 0.90)

    plus10 = s.search(s.incr0 * 1.10, -MAX_CUT, s.cap_change())
    q3 = s.describe("Lowest budget for +10% incremental revenue", s.optimal(plus10)) if plus10 is not None else None

    fixed = s.describe("Same budget, optimal mix (max revenue = max ROAS)", s.optimal(0.0))
    mroi1 = s.describe("Flexible budget: spend until mROI = 1 per channel", s.flexible_mroi(1.0), "Target mROI = 1 per channel, Meridian flexible-budget default (0-200% of current)")

    scenarios = {
        "window": {"firstWeek": s.window[0], "lastWeek": s.window[-1], "weeks": len(s.window), "months": s.months},
        "guardrails": {"maxCutPct": MAX_CUT * 100, "maxIncreasePct": MAX_INCREASE * 100, "reference": "budget x historical share (Meridian default spend constraints)", "planningCapMonthly": PLANNING_CAP_MONTHLY},
        "engine": "Dynamic programming on the Meridian response grid (posterior mean incremental revenue)",
        "totalRevenueMonthly": s.monthly(s.total_revenue),
        "current": current,
        "q1FlatIncremental": q1,
        "q2Cut10": {"optimal": cut10_optimal, "sameMix": cut10_same},
        "q3Plus10Incremental": q3,
        "q4FixedBudget": fixed,
        "q5MroiOne": mroi1,
        "frontier": frontier,
    }
    output = json.loads(args.output.read_text(encoding="utf-8"))
    output["scenarios"] = scenarios
    args.output.write_text(json.dumps(output, indent=1), encoding="utf-8")
    if q1:
        print(f"Q1 flat incremental: budget {q1['budgetChangePct']:+.1f}%")
    print(f"Q2 budget -10%: optimal incr {cut10_optimal['incrementalChangePct']:+.2f}% (total revenue {cut10_optimal['totalRevenueChangePct']:+.2f}%); same mix incr {cut10_same['incrementalChangePct']:+.2f}% (total {cut10_same['totalRevenueChangePct']:+.2f}%)")
    print(f"Q3 +10% incremental: {'budget %+.1f%%' % q3['budgetChangePct'] if q3 else 'not reachable within guardrails'}")
    print(f"Q4 same budget optimal: incr {fixed['incrementalChangePct']:+.2f}%, ROAS {current['roas']:.2f} -> {fixed['roas']:.2f}")
    print(f"Q5 mROI=1: budget {mroi1['budgetChangePct']:+.1f}%, incr {mroi1['incrementalChangePct']:+.2f}%")


if __name__ == "__main__":
    main()
