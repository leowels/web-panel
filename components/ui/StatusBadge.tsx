import React from 'react'

type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger'

const toneClasses: Record<StatusTone, string> = {
  neutral: 'bg-slate-100 text-slate-700',
  info: 'bg-blue-100 text-blue-800',
  success: 'bg-emerald-100 text-emerald-800',
  warning: 'bg-amber-100 text-amber-800',
  danger: 'bg-red-100 text-red-800',
}

interface StatusBadgeProps {
  label: string
  tone?: StatusTone
  className?: string
}

export default function StatusBadge({ label, tone = 'neutral', className = '' }: StatusBadgeProps) {
  return (
    <span className={`inline-flex items-center px-2.5 py-1 text-xs font-semibold rounded-full ${toneClasses[tone]} ${className}`}>
      {label}
    </span>
  )
}
