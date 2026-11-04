import { cloneElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import MistakeCostLedger from "../MistakeCostLedger";

// jsdom gives ResponsiveContainer no size, so it draws nothing. Hand the chart
// a fixed one to check where the axis labels land.
const WIDTH = 600;
vi.mock("recharts", async (importOriginal) => {
  const recharts = await importOriginal();
  return {
    ...recharts,
    ResponsiveContainer: ({ children }) =>
      cloneElement(children, { width: 600, height: 224 }),
  };
});

const zero = { trades: 0, net: 0 };

describe("MistakeCostLedger layout", () => {
  it("leaves room right of the last axis label, which is centered on the plot's edge", () => {
    const { container } = render(
      <MistakeCostLedger
        costs={{
          followed: { trades: 1, net: 187.4 },
          window: { trades: 2, net: -23.9 },
          size: zero,
          both: zero,
        }}
      />,
    );

    const labels = [
      ...container.querySelectorAll(
        ".recharts-xAxis .recharts-cartesian-axis-tick-value",
      ),
    ];
    // Node formats it "$200.0" where browsers say "$200"; either way it's the top tick.
    expect(labels.at(-1).textContent).toMatch(/^\$200/);
    // "$200" at 11px is about 26px wide, so half of it, 13px, hangs past its tick.
    // Anything less than that and the chart's edge cuts it ("$20").
    const room = WIDTH - Number(labels.at(-1).getAttribute("x"));
    expect(room).toBeGreaterThanOrEqual(20);
  });
});
