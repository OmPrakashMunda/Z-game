/**
 * Tunable game numbers. All durations are in GAME seconds (scaled by the time scale)
 * unless the name says "real".
 */
export const HOUR = 3600;
export const DAY = 24 * HOUR;

export const balance = {
  startingMoney: 500_000,
  startDay: 1,
  startHour: 8,
  outbreakDay: 30,
  panicStartDay: 20,
  zombieCap: 150,

  // Real-time values (not scaled)
  autosaveRealSeconds: 60,
  simStep: 0.05, // 20 Hz fixed step
  maxFrameDelta: 0.25,

  // Building: how many pieces your crew can work on at once
  crewSize: 3,

  // Buying more land next to your plot
  /** Each expansion adds a strip this many grid cells wide (5 cells = 10 m). */
  landStepCells: 5,
  /** Most expansions per side. */
  landMaxSteps: 4,
  /** Price per square meter relative to what you paid for the plot. */
  landPriceFactor: 0.85,
  /** Each earlier expansion on the same side makes the next one this much dearer. */
  landPriceGrowth: 0.2,

  // Returns: unused items go back to the online store for this share of the shelf price (never the panic price)
  returnRate: 0.8,

  // Ordering (delivery is instant and free; the online store charges a small convenience markup instead)
  /** Share of normal stock that comes back each day (up to the cap). */
  dailyRestockRate: 0.2,
  /** At full panic, stock of the most affected goods is cut by this much. */
  panicStockCut: 0.75,

  // Travel on the city map: game minutes = base + distance (meters) * perMeter
  travelBaseMinutes: 6,
  travelMinutesPerMeter: 0.22,
  /** Real seconds the travel time-lapse takes (min, max). */
  travelAnimSeconds: [1.2, 2.6] as readonly [number, number],
} as const;
