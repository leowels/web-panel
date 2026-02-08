'use client'

import React from 'react'

type IconProps = {
  size?: number
  color?: string
}

function GearIcon({ size = 16, color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Zm9 3.5c0-.5-.04-.98-.12-1.46l-2.3-.35a7.98 7.98 0 0 0-.9-2.18l1.35-1.87a9.9 9.9 0 0 0-2.06-2.06l-1.87 1.35a7.98 7.98 0 0 0-2.18-.9l-.35-2.3A9.9 9.9 0 0 0 12 2c-.5 0-.98.04-1.46.12l-.35 2.3a7.98 7.98 0 0 0-2.18.9L6.14 3.97A9.9 9.9 0 0 0 4.08 6.03l1.35 1.87c-.38.68-.68 1.41-.9 2.18l-2.3.35A9.9 9.9 0 0 0 2 12c0 .5.04.98.12 1.46l2.3.35c.22.77.52 1.5.9 2.18l-1.35 1.87c.6.76 1.3 1.46 2.06 2.06l1.87-1.35c.68.38 1.41.68 2.18.9l.35 2.3c.48.08.96.12 1.46.12.5 0 .98-.04 1.46-.12l.35-2.3c.77-.22 1.5-.52 2.18-.9l1.87 1.35c.76-.6 1.46-1.3 2.06-2.06l-1.35-1.87c.38-.68.68-1.41.9-2.18l2.3-.35c.08-.48.12-.96.12-1.46Z"
        fill={color}
      />
    </svg>
  )
}

function HookIcon({ size = 16, color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M12 3v8" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <path d="M12 11c0 3 2 5 4 5a3 3 0 0 0 3-3" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <circle cx="19" cy="13" r="2" stroke={color} strokeWidth="2" fill="none" />
    </svg>
  )
}

function LiftIcon({ size = 16, color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="6" y="4" width="12" height="16" rx="2" stroke={color} strokeWidth="2" />
      <path d="M9 9h6M9 13h6" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

export function getEquipmentTypeIcon(type: string, size = 16, color = 'currentColor') {
  if (!type) return <GearIcon size={size} color={color} />
  const t = type.toLowerCase()
  if (t.includes('кран') || t.includes('балка') || t.includes('монорельс') || t.includes('консольн')) {
    return <HookIcon size={size} color={color} />
  }
  if (t.includes('подъемник') || t.includes('лифт') || t.includes('эскалатор')) {
    return <LiftIcon size={size} color={color} />
  }
  return <GearIcon size={size} color={color} />
}

