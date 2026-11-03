import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import MistakeCostLedger, { BucketTooltip } from "../MistakeCostLedger";

const zero = { trades: 0, net: 0 };

describe("MistakeCostLedger", () => {
  it("sums up each bucket that has trades in words, in the chart order", () => {
    render(
      <MistakeCostLedger
        costs={{
          followed: { trades: 3, net: 60 },
          window: { trades: 1, net: -30 },
          size: zero,
          both: { trades: 1, net: -15 },
        }}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Mistake cost ledger" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Rules followed: 3 trades, +$60.00. Lockout only: 1 trade, -$30.00. Lockout and size: 1 trade, -$15.00.",
      ),
    ).toBeInTheDocument();
  });

  it("says so when no option trade has closed, instead of drawing empty axes", () => {
    render(
      <MistakeCostLedger
        costs={{ followed: zero, window: zero, size: zero, both: zero }}
      />,
    );

    expect(
      screen.getByText("No closed option trades in this range."),
    ).toBeInTheDocument();
  });
});

describe('BucketTooltip', () => {
  it('leads with the net P/L, then the bucket and its trades', () => {
    render(<BucketTooltip active payload={[{ payload: { name: 'Lockout only', net: -30, trades: 1 } }]} />);

    expect(screen.getByText('-$30.00')).toBeInTheDocument();
    expect(screen.getByText('Lockout only · 1 trade')).toBeInTheDocument();
  });

  it('renders nothing while the pointer is off the chart', () => {
    const { container } = render(<BucketTooltip active={false} payload={[]} />);

    expect(container).toBeEmptyDOMElement();
  });
});
