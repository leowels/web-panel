import React from 'react'

interface EmptyStateProps {
  title: string
  description?: string
  icon?: React.ReactNode
}

export default function EmptyState({ title, description, icon }: EmptyStateProps) {
  return (
    <div className="p-10 text-center">
      {icon && <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center text-slate-400">{icon}</div>}
      <p className="text-sm font-semibold text-slate-600">{title}</p>
      {description && <p className="mt-2 text-xs text-slate-500">{description}</p>}
    </div>
  )
}
