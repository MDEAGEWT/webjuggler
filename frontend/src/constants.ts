// matplotlib default 8-color palette (same as PlotJuggler)
export const PLOT_COLORS = [
  '#1f77b4',
  '#d62728',
  '#1ac938',
  '#ff7f0e',
  '#f14cc1',
  '#9467bd',
  '#17becf',
  '#bcbd22',
] as const

// Global color counter — increments each time a series is added to any plot
let _globalColorIndex = 0

export function nextGlobalColor(): string {
  const color = PLOT_COLORS[_globalColorIndex % PLOT_COLORS.length]!
  _globalColorIndex++
  return color
}

export function resetGlobalColorIndex(): void {
  _globalColorIndex = 0
}
