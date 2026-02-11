import React from 'react'

interface ToolbarProps {
  children: React.ReactNode
  className?: string
}

export default function Toolbar({ children, className = '' }: ToolbarProps) {
  return (
    <div className={`flex flex-wrap items-center gap-3 ${className}`}>
      {children}
    </div>
  )
}
