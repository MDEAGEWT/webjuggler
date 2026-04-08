export interface Topic {
  name: string
  fields: string[]
  dataPoints: number
}

export interface FieldData {
  timestamps: Float64Array
  values: Float64Array
}

export interface DropoutInfo {
  timestamp: number
  durationMs: number
}

export interface FileInfo {
  fileId: string
  filename: string
  size: number
  uploadedBy: string
  status: string
}

export type LayoutNode = SplitNode | PlotNode

export interface SplitNode {
  type: 'split'
  direction: 'vertical' | 'horizontal'
  children: [LayoutNode, LayoutNode]
}

export interface AxisTransform {
  negate?: boolean  // multiply values by -1
  swap?: [number, number]  // swap two axis indices (e.g., [1, 2] swaps Y and Z)
}

export interface PlotNode {
  type: 'plot'
  id: string
  series: string[]
  plotMode: 'timeseries' | 'xy' | '3d' | 'attitude'
  displayMode?: 'graph' | 'compass'
  axisNegate?: boolean[]  // per-axis negate: [negX, negY, negZ]
}
