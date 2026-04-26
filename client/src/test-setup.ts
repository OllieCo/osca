// CSS.escape is not available in all jsdom versions — polyfill it.
if (typeof CSS === "undefined" || !CSS.escape) {
  (globalThis as Record<string, unknown>).CSS = {
    escape: (value: string) => value.replace(/([^\w-])/g, "\\$1"),
  }
}

// jsdom doesn't implement sessionStorage fully in all test runners — polyfill it.
const store: Record<string, string> = {}
Object.defineProperty(window, "sessionStorage", {
  value: {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v },
    removeItem: (k: string) => { delete store[k] },
    clear: () => { Object.keys(store).forEach((k) => delete store[k]) },
  },
  writable: false,
})
