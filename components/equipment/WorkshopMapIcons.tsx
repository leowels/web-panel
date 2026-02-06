'use client'

import React from 'react'

/** SVG иконки для элементов карты цеха */

/** Колонна — цилиндрическая опора */
export function ColumnIcon({
  x,
  y,
  size = 40,
  fill = '#94a3b8',
  stroke = '#64748b',
  id = 'col',
}: {
  x: number
  y: number
  size?: number
  fill?: string
  stroke?: string
  id?: string
}) {
  const r = size / 2
  const gid = `col-grad-${id}`.replace(/[^a-z0-9-]/gi, '-')
  return (
    <g transform={`translate(${x}, ${y})`}>
      <defs>
        <linearGradient id={gid} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={fill} stopOpacity="0.9" />
          <stop offset="50%" stopColor={fill} />
          <stop offset="100%" stopColor={fill} stopOpacity="0.7" />
        </linearGradient>
      </defs>
      <circle cx={0} cy={0} r={r} fill={`url(#${gid})`} stroke={stroke} strokeWidth={2} />
      <ellipse cx={0} cy={-r * 0.3} rx={r * 0.3} ry={r * 0.15} fill="none" stroke={stroke} strokeWidth={1} opacity={0.6} />
    </g>
  )
}

/** Стена — кирпичная кладка */
export function WallIcon({
  x,
  y,
  width = 30,
  height = 80,
  fill = '#78716c',
  stroke = '#57534e',
  id = 'wall',
}: {
  x: number
  y: number
  width?: number
  height?: number
  fill?: string
  stroke?: string
  id?: string
}) {
  const brickW = Math.max(8, width / 3)
  const brickH = Math.max(6, height / 6)
  const pid = `brick-${id}`.replace(/[^a-z0-9-]/gi, '-')
  return (
    <g transform={`translate(${x}, ${y})`}>
      <defs>
        <pattern id={pid} width={brickW} height={brickH} patternUnits="userSpaceOnUse">
          <rect width={brickW} height={brickH} fill={fill} stroke={stroke} strokeWidth={0.5} />
        </pattern>
      </defs>
      <rect x={-width / 2} y={-height / 2} width={width} height={height} fill={`url(#${pid})`} stroke={stroke} strokeWidth={2} />
    </g>
  )
}

/** Кран башенный/стреловой — вертикальная мачта + стрела + крюк */
export function CraneIcon({
  x,
  y,
  size = 28,
  fill = 'white',
}: {
  x: number
  y: number
  size?: number
  fill?: string
}) {
  const s = size / 24
  return (
    <g transform={`translate(${x}, ${y})`} className="pointer-events-none">
      {/* Мачта (вертикальная) */}
      <line x1={0} y1={8 * s} x2={0} y2={-10 * s} stroke={fill} strokeWidth={1.5 * s} strokeLinecap="round" />
      {/* Основание */}
      <line x1={-4 * s} y1={8 * s} x2={4 * s} y2={8 * s} stroke={fill} strokeWidth={1 * s} strokeLinecap="round" />
      {/* Стрела (горизонтальная) */}
      <line x1={0} y1={-6 * s} x2={12 * s} y2={-6 * s} stroke={fill} strokeWidth={1.2 * s} strokeLinecap="round" />
      {/* Растяжка */}
      <line x1={0} y1={-2 * s} x2={10 * s} y2={-6 * s} stroke={fill} strokeWidth={0.8 * s} strokeLinecap="round" strokeOpacity={0.8} />
      {/* Трос + крюк */}
      <line x1={12 * s} y1={-6 * s} x2={12 * s} y2={2 * s} stroke={fill} strokeWidth={0.6 * s} strokeLinecap="round" strokeDasharray="2,1" />
      <path d={`M ${12 * s - 2} ${2 * s} L ${12 * s} ${4 * s} L ${12 * s + 2} ${2 * s} Z`} fill={fill} stroke="none" />
    </g>
  )
}

/** Кран-балка — горизонтальная балка + таль с крюком */
export function CraneBeamIcon({
  x,
  y,
  size = 28,
  fill = 'white',
}: {
  x: number
  y: number
  size?: number
  fill?: string
}) {
  const s = size / 24
  return (
    <g transform={`translate(${x}, ${y})`} className="pointer-events-none">
      {/* Балка (горизонтальная I-образная) */}
      <rect x={-10 * s} y={-8 * s} width={20 * s} height={2.5 * s} rx={0.5 * s} fill={fill} stroke="none" />
      <rect x={-8 * s} y={-10 * s} width={2 * s} height={6 * s} fill={fill} stroke="none" />
      <rect x={6 * s} y={-10 * s} width={2 * s} height={6 * s} fill={fill} stroke="none" />
      {/* Таль (тележка) */}
      <rect x={-2 * s} y={-5 * s} width={4 * s} height={4 * s} rx={0.5 * s} fill={fill} stroke="none" />
      {/* Трос + крюк */}
      <line x1={0} y1={-1 * s} x2={0} y2={6 * s} stroke={fill} strokeWidth={0.6 * s} strokeLinecap="round" strokeDasharray="1.5,1" />
      <path d={`M -1.5 ${6 * s} L 0 ${8 * s} L 1.5 ${6 * s} Z`} fill={fill} stroke="none" />
    </g>
  )
}

/** Определяет, является ли тип краном или кран-балкой */
export function isCraneType(type: string): boolean {
  if (!type) return false
  const t = type.toLowerCase()
  return t.includes('кран') || t.includes('балка') || t.includes('монорельс') || t.includes('консольно')
}

export function isCraneBeamType(type: string): boolean {
  if (!type) return false
  const t = type.toLowerCase()
  return t.includes('балка') || t.includes('монорельс')
}
