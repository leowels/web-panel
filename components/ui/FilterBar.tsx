import React from 'react'

interface FilterBarProps {
  children: React.ReactNode
  className?: string
}

export default function FilterBar({ children, className = '' }: FilterBarProps) {
  return (
    <div className={`bg-white border border-slate-200 rounded-xl p-4 sm:p-5 ${className}`}>
      {children}
    </div>
  )
}
