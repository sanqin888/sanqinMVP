import { readFileSync } from "node:fs";
import path from "node:path";

function readDisplaySource(fileName: "layout.tsx" | "page.tsx"): string {
  return readFileSync(
    path.join(
      process.cwd(),
      "src",
      "app",
      "[locale]",
      "(device)",
      "store",
      "display",
      fileName,
    ),
    "utf8",
  );
}

describe("Customer Display workstation launch contract", () => {
  it("is a non-installable display route rather than another PWA identity", () => {
    const layout = readDisplaySource("layout.tsx");

    expect(layout).toContain('title: "SanQ Customer Display"');
    expect(layout).toContain("manifest: null");
    expect(layout).toContain("capable: false");
    expect(layout).toContain("index: false");
  });

  it("remains a read-only local projection of the POS display snapshot", () => {
    const page = readDisplaySource("page.tsx");

    expect(page).toContain("POS_DISPLAY_STORAGE_KEY");
    expect(page).toContain("POS_DISPLAY_CHANNEL");
    expect(page).toContain('window.addEventListener("storage"');
    expect(page).toContain("new BroadcastChannel(POS_DISPLAY_CHANNEL)");
    expect(page).toContain("window.setInterval(readSnapshot, 800)");

    expect(page).not.toContain("fetch(");
    expect(page).not.toContain("localStorage.setItem");
    expect(page).not.toContain("localStorage.removeItem");
    expect(page).not.toContain("<button");
    expect(page).not.toContain("<form");
    expect(page).not.toContain("<input");
  });
});
