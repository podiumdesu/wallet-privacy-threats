import type { Page, Locator, Frame } from "playwright";

export function buildCandidates(
  scope: Page | Frame,
  re: RegExp,
  btnOnly?: boolean
): Locator[] {
  const btnOnlyCandidates = [
    scope.getByRole("button", { name: re }),
    scope.getByRole("link", { name: re }),
    scope.getByRole("menuitem", { name: re }),
    scope.locator("button", { hasText: re }),
    scope.locator('[role="button"]', { hasText: re }),
    scope.locator("a", { hasText: re }),
    scope.locator('[role="link"]', { hasText: re }),
    scope.locator('div,button,a,p,[role="button"],[role="link"]', {
      hasText: re,
    }),

    // scope.getByRole("button", { name: re }),
    // scope.getByRole("link", { name: re }),
    // scope.getByRole("menuitem", { name: re }),
    // scope.locator("button", { hasText: re }),
  ];
  // Keep this lean and ordered by likelihood/speed
  if (btnOnly) {
    // looking for clickable buttons
    return btnOnlyCandidates;
  }
  // General matching
  return [
    ...btnOnlyCandidates,
    scope.locator(':is(div,p,span,li,td,th,[role="option"],[role="tab"])', {
      hasText: re,
    }),
    scope.locator("div", { hasText: re }),
    // generic text last (can be expensive)
    scope.getByText(re),
  ];
}

export async function findPattern(
  page: Page | Frame,
  pattern: readonly RegExp[],
  opts?: {
    timeoutMs?: number;
    btnOnly?: boolean;
    includeIframes?: boolean;
    pollMs?: number;
  }
): Promise<Locator | null> {
  // const isSingleLine = async (el: Locator) => {
  //   try {
  //     const txt = await el.innerText();
  //     return !/\n/.test(txt);
  //   } catch {
  //     return false;
  //   }
  // };

  const scopes: Array<Page | Frame> = [
    page,
    ...(typeof (page as Page).frames === "function"
      ? (page as Page).frames()
      : []),
  ];
  for (const re of pattern) {
    for (const scope of scopes) {
      for (const loc of buildCandidates(scope, re, opts?.btnOnly)) {
        const n = await loc.count();
        for (let i = 0; i < n; i++) {
          const el = loc.nth(i);
          try {
            const txt = (await el.innerText().catch(() => ""))?.trim() || "";
            const single = !/\n/.test(txt);
            const visible = await el.isVisible().catch(() => false);
            // console.log("Checking:", re, visible, single);
            // console.log(loc);
            // console.log(txt);
            // console.log(await el.innerHTML());

            if (visible && single) return el;
          } catch {
            /* ignore and continue */
          }
        }
      }
    }
  }
  return null;
}

export async function hasPattern(
  page: Page,
  pattern: readonly RegExp[],
  opts?: {
    timeoutMs?: number;
    btnOnly?: boolean;
    includeIframes?: boolean;
    pollMs?: number;
  }
): Promise<boolean> {
  return (await findPattern(page, pattern, opts)) !== null;
}
