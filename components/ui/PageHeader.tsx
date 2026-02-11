import React from 'react'

interface PageHeaderProps {
  title: string
  subtitle?: string
  actions?: React.ReactNode
  meta?: React.ReactNode
}

export default function PageHeader({ title, subtitle, actions, meta }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 tracking-tight">{title}</h1>
        {subtitle && <p className="text-gray-600 mt-2 font-medium">{subtitle}</p>}
        {meta && <div className="mt-3">{meta}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-3 w-full lg:w-auto">{actions}</div>}
    </div>
  )
}
