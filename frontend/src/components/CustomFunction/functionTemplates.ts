export interface FunctionTemplate {
  name: string
  expression: string
  description: string
  requiredInputs: number  // 0 = value only, N = needs v1..vN
}

export const functionTemplates: FunctionTemplate[] = [
  {
    name: 'backward_difference_derivative',
    expression: '(value - prev_value) / (time - prev_time)',
    description: 'First derivative (backward difference)',
    requiredInputs: 0,
  },
  {
    name: 'central_difference_derivative',
    expression: '(next_value - prev_value) / (next_time - prev_time)',
    description: 'First derivative (central difference)',
    requiredInputs: 0,
  },
  {
    name: 'integral',
    expression: 'acc + value * (time - prev_time)',
    description: 'Cumulative integral (left Riemann sum)',
    requiredInputs: 0,
  },
  {
    name: 'quat_to_pitch',
    expression: 'asin(-2 * (v1 * v3 - value * v2))',
    description: 'Quaternion to pitch angle (rad)',
    requiredInputs: 3,
  },
  {
    name: 'quat_to_roll',
    expression: 'atan2(2 * (value * v1 + v2 * v3), 1 - 2 * (v1^2 + v2^2))',
    description: 'Quaternion to roll angle (rad)',
    requiredInputs: 3,
  },
  {
    name: 'quat_to_yaw',
    expression: 'atan2(2 * (value * v3 + v1 * v2), 1 - 2 * (v2^2 + v3^2))',
    description: 'Quaternion to yaw angle (rad)',
    requiredInputs: 3,
  },
  {
    name: 'rad_to_deg',
    expression: 'value * 180 / pi',
    description: 'Radians to degrees',
    requiredInputs: 0,
  },
  {
    name: 'remove_offset',
    expression: 'value - first_value',
    description: 'Remove initial offset',
    requiredInputs: 0,
  },
  {
    name: 'dist_2d',
    expression: 'sqrt((value - v2)^2 + (v1 - v3)^2)',
    description: '2D Euclidean distance between (value,v1) and (v2,v3)',
    requiredInputs: 3,
  },
  {
    name: 'dist_3d',
    expression: 'sqrt((value - v3)^2 + (v1 - v4)^2 + (v2 - v5)^2)',
    description: '3D Euclidean distance between (value,v1,v2) and (v3,v4,v5)',
    requiredInputs: 5,
  },
]
