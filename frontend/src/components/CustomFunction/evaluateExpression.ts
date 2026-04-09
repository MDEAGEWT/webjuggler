import { compile } from 'mathjs/number'
import type { FieldData } from '../../types'

/**
 * Binary search for nearest timestamp index in a sorted Float64Array.
 */
function nearestIndex(timestamps: Float64Array, target: number): number {
  let lo = 0
  let hi = timestamps.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if ((timestamps[mid] as number) < target) lo = mid + 1
    else hi = mid
  }
  // Check if lo-1 is closer
  if (lo > 0 && Math.abs((timestamps[lo - 1] as number) - target) < Math.abs((timestamps[lo] as number) - target)) {
    return lo - 1
  }
  return lo
}

export interface EvaluateInput {
  expression: string
  main: FieldData
  additional: FieldData[]  // v1, v2, v3, ...
}

export function evaluateExpression(input: EvaluateInput): FieldData {
  const { expression, main, additional } = input
  const len = main.timestamps.length
  const resultValues = new Float64Array(len)
  const compiled = compile(expression)

  const isIntegral = expression.includes('acc')
  let acc = 0

  for (let i = 0; i < len; i++) {
    const time = main.timestamps[i] as number
    const value = main.values[i] as number

    const scope: Record<string, number> = {
      time,
      value,
      prev_value: i > 0 ? (main.values[i - 1] as number) : NaN,
      prev_time: i > 0 ? (main.timestamps[i - 1] as number) : NaN,
      next_value: i < len - 1 ? (main.values[i + 1] as number) : NaN,
      next_time: i < len - 1 ? (main.timestamps[i + 1] as number) : NaN,
      first_value: (main.values[0] as number),
      acc,
    }

    // Bind additional series as v1, v2, v3, ...
    for (let j = 0; j < additional.length; j++) {
      const addSeries = additional[j] as FieldData
      const idx = nearestIndex(addSeries.timestamps, time)
      scope[`v${j + 1}`] = (addSeries.values[idx] as number)
    }

    let result: number
    try {
      result = compiled.evaluate(scope) as number
    } catch {
      result = NaN
    }

    // Special case: integral at i=0
    if (isIntegral && i === 0) {
      result = 0
    }

    resultValues[i] = typeof result === 'number' ? result : NaN

    // Feed back result as acc for next iteration
    if (isIntegral) {
      acc = resultValues[i] as number
    }
  }

  return {
    timestamps: new Float64Array(main.timestamps),
    values: resultValues,
  }
}
