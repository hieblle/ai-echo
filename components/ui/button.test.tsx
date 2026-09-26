import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button } from "./button";

describe("Button", () => {
  it("renders its label", () => {
    render(<Button>Befragung starten</Button>);
    expect(
      screen.getByRole("button", { name: "Befragung starten" }),
    ).toBeInTheDocument();
  });

  it("can be disabled", () => {
    render(<Button disabled>Dashboard</Button>);
    expect(screen.getByRole("button", { name: "Dashboard" })).toBeDisabled();
  });
});
