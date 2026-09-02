import type { Destination } from '../content/destinations'

// 编辑风目的地封面：本地生成的 SVG（色纸 + 弧线 + 坐标 + 衬线首字母），
// 不依赖远程图片，比例统一 4:5
export default function DestinationCover({ destination }: { destination: Destination }) {
  const [base, primary, accent] = destination.palette
  const initial = destination.nameEn.slice(0, 1)

  return (
    <svg
      className="mag-cover-art"
      viewBox="0 0 400 500"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      <rect width="400" height="500" fill={base} />
      {/* 大弧：地平线意象 */}
      <circle cx="330" cy="458" r="210" fill={primary} opacity=".16" />
      <circle cx="330" cy="458" r="210" fill="none" stroke={primary} strokeWidth="1.2" opacity=".5" />
      <circle cx="330" cy="458" r="148" fill={primary} opacity=".12" />
      {/* 经纬点缀 */}
      <line x1="0" y1="120" x2="400" y2="120" stroke={primary} strokeWidth=".6" opacity=".28" />
      <line x1="0" y1="372" x2="400" y2="372" stroke={primary} strokeWidth=".6" opacity=".28" />
      {/* 衬线首字母 */}
      <text
        x="36" y="238" fontSize="188" fill={primary} opacity=".82"
        style={{ fontFamily: 'Georgia, "Noto Serif SC", serif', fontWeight: 400 }}
      >
        {initial}
      </text>
      <text
        x="40" y="300" fontSize="21" fill={accent} letterSpacing="5"
        style={{ fontFamily: 'Georgia, serif' }}
      >
        {destination.nameEn.toUpperCase()}
      </text>
      {/* 坐标（杂志版权栏风格） */}
      <text x="40" y="448" fontSize="12" fill={primary} opacity=".75" letterSpacing="2"
        style={{ fontFamily: '"Cascadia Mono", Consolas, monospace' }}>
        {destination.coords}
      </text>
      <rect x="24" y="24" width="352" height="452" fill="none" stroke={primary} strokeWidth="1" opacity=".35" />
    </svg>
  )
}
