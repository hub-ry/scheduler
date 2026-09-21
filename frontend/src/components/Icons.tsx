import React from 'react'

export type IconName =
  | 'calendar'
  | 'calendar21'
  | 'clock'
  | 'search'
  | 'plus'
  | 'check'
  | 'x'
  | 'caretLeft'
  | 'caretRight'
  | 'caretDown'
  | 'caretUp'
  | 'trash'
  | 'sun'
  | 'moon'
  | 'desktop'
  | 'checkCircle'
  | 'warningCircle'
  | 'lightbulb'
  | 'graduationCap'
  | 'users'
  | 'sync'
  | 'upload'
  | 'dragHandle'
  | 'sparkle'
  | 'info'
  | 'pencilSimple'

interface IconProps extends React.SVGProps<SVGSVGElement> {
  name: IconName
  size?: number
  className?: string
}

export function Icon({ name, size = 16, className = '', ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 256 256"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="16"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`ph ph-${name} ${className}`.trim()}
      {...props}
    >
      {ICONS[name]}
    </svg>
  )
}

const ICONS: Record<IconName, React.ReactNode> = {
  calendar: (
    <>
      <rect x="40" y="40" width="176" height="176" rx="8" />
      <line x1="176" y1="24" x2="176" y2="56" />
      <line x1="80" y1="24" x2="80" y2="56" />
      <line x1="40" y1="88" x2="216" y2="88" />
    </>
  ),
  calendar21: (
    <>
      <rect x="36" y="40" width="184" height="176" rx="16" />
      <line x1="176" y1="20" x2="176" y2="56" />
      <line x1="80" y1="20" x2="80" y2="56" />
      <line x1="36" y1="92" x2="220" y2="92" />
      <text
        x="128"
        y="176"
        fontSize="64"
        fontWeight="700"
        fontFamily="system-ui, -apple-system, sans-serif"
        textAnchor="middle"
        fill="currentColor"
        stroke="none"
      >
        21
      </text>
    </>
  ),
  clock: (
    <>
      <circle cx="128" cy="128" r="96" />
      <polyline points="128 72 128 128 184 128" />
    </>
  ),
  search: (
    <>
      <circle cx="112" cy="112" r="80" />
      <line x1="168.5" y1="168.5" x2="224" y2="224" />
    </>
  ),
  plus: (
    <>
      <line x1="40" y1="128" x2="216" y2="128" />
      <line x1="128" y1="40" x2="128" y2="216" />
    </>
  ),
  check: <polyline points="216 72 104 184 48 128" />,
  x: (
    <>
      <line x1="200" y1="56" x2="56" y2="200" />
      <line x1="200" y1="200" x2="56" y2="56" />
    </>
  ),
  caretLeft: <polyline points="160 208 80 128 160 48" />,
  caretRight: <polyline points="96 48 176 128 96 208" />,
  caretDown: <polyline points="208 96 128 176 48 96" />,
  caretUp: <polyline points="48 160 128 80 208 160" />,
  trash: (
    <>
      <line x1="216" y1="56" x2="40" y2="56" />
      <line x1="104" y1="104" x2="104" y2="168" />
      <line x1="152" y1="104" x2="152" y2="168" />
      <path d="M200,56V208a8,8,0,0,1-8,8H64a8,8,0,0,1-8-8V56" />
      <path d="M168,56V40a8,8,0,0,0-8-8H96a8,8,0,0,0-8,8V56" />
    </>
  ),
  sun: (
    <>
      <circle cx="128" cy="128" r="60" />
      <line x1="128" y1="36" x2="128" y2="16" />
      <line x1="128" y1="220" x2="128" y2="240" />
      <line x1="63" y1="63" x2="49" y2="49" />
      <line x1="193" y1="193" x2="207" y2="207" />
      <line x1="36" y1="128" x2="16" y2="128" />
      <line x1="220" y1="128" x2="240" y2="128" />
      <line x1="63" y1="193" x2="49" y2="207" />
      <line x1="193" y1="63" x2="207" y2="49" />
    </>
  ),
  moon: <path d="M216.7,152.6A91.9,91.9,0,0,1,103.4,39.3,96,96,0,1,0,216.7,152.6Z" />,
  desktop: (
    <>
      <rect x="32" y="48" width="192" height="144" rx="8" />
      <line x1="160" y1="224" x2="96" y2="224" />
      <line x1="128" y1="192" x2="128" y2="224" />
    </>
  ),
  checkCircle: (
    <>
      <circle cx="128" cy="128" r="96" />
      <polyline points="172 104 113.3 160 84 132" />
    </>
  ),
  warningCircle: (
    <>
      <circle cx="128" cy="128" r="96" />
      <line x1="128" y1="80" x2="128" y2="136" />
      <circle cx="128" cy="172" r="10" fill="currentColor" stroke="none" />
    </>
  ),
  lightbulb: (
    <>
      <path d="M88,112a40,40,0,1,1,80,0c0,17.7-10.7,30.3-19.1,40H107.1C98.7,142.3,88,129.7,88,112Z" />
      <line x1="104" y1="184" x2="152" y2="184" />
      <line x1="112" y1="216" x2="144" y2="216" />
    </>
  ),
  graduationCap: (
    <>
      <polygon points="24 96 128 40 232 96 128 152 24 96" />
      <path d="M56,113.3V168c0,26.5,32.2,48,72,48s72-21.5,72-48V113.3" />
      <line x1="232" y1="96" x2="232" y2="160" />
    </>
  ),
  users: (
    <>
      <circle cx="88" cy="108" r="52" />
      <path d="M155.4,57.9A54.5,54.5,0,0,1,168,56a52,52,0,0,1,0,104,54.5,54.5,0,0,1-12.6-1.9" />
      <path d="M16,197.9a88,88,0,0,1,144,0" />
      <path d="M169.3,160a87.6,87.6,0,0,1,70.7,37.9" />
    </>
  ),
  sync: (
    <>
      <polyline points="176.4 99.7 224.4 99.7 224.4 51.7" />
      <path d="M190.2,190.2a88,88,0,1,1,3.4-124.4l30.8,33.9" />
    </>
  ),
  upload: (
    <>
      <polyline points="88 88 128 48 168 88" />
      <line x1="128" y1="48" x2="128" y2="160" />
      <path d="M216,152v56a8,8,0,0,1-8,8H48a8,8,0,0,1-8-8V152" />
    </>
  ),
  dragHandle: (
    <>
      <circle cx="96" cy="64" r="12" fill="currentColor" stroke="none" />
      <circle cx="160" cy="64" r="12" fill="currentColor" stroke="none" />
      <circle cx="96" cy="128" r="12" fill="currentColor" stroke="none" />
      <circle cx="160" cy="128" r="12" fill="currentColor" stroke="none" />
      <circle cx="96" cy="192" r="12" fill="currentColor" stroke="none" />
      <circle cx="160" cy="192" r="12" fill="currentColor" stroke="none" />
    </>
  ),
  sparkle: <polygon points="128 24 146 90 212 108 146 126 128 192 110 126 44 108 110 90 128 24" />,
  info: (
    <>
      <circle cx="128" cy="128" r="96" />
      <line x1="128" y1="120" x2="128" y2="176" />
      <circle cx="128" cy="88" r="10" fill="currentColor" stroke="none" />
    </>
  ),
  pencilSimple: (
    <>
      <path d="M92.7,216H48a8,8,0,0,1-8-8V163.3a7.9,7.9,0,0,1,2.3-5.6l120-120a8,8,0,0,1,11.4,0l44.6,44.7a8,8,0,0,1,0,11.3l-120,120A8.2,8.2,0,0,1,92.7,216Z" />
      <line x1="136" y1="64" x2="192" y2="120" />
    </>
  ),
}
