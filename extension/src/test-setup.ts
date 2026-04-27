// CSS.escape is not available in all jsdom versions — polyfill it.
if (typeof CSS === "undefined" || !CSS.escape) {
  ;(globalThis as Record<string, unknown>).CSS = {
    escape: (value: string) => value.replace(/([^\w-])/g, "\\$1"),
  }
}
