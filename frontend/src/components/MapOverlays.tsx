import type { MapRenderPlan } from '../features/journey/mapRouting'
import { UNSCHEDULED_COLOR } from '../features/journey/mapRouting'

// 地图覆盖信息层（纯展示，可在 jsdom 测试）：
// 空态 / 每日图例 / 编号说明 / 部分坐标无效的诚实提示
export default function MapOverlays({ plan }: { plan: MapRenderPlan | null }) {
  if (!plan) return null

  if (plan.validCount === 0) {
    return (
      <div className="map-empty-note" role="status">
        <p>当前行程暂无可定位地点</p>
        {plan.skippedCount > 0 && <small>另有 {plan.skippedCount} 个地点缺少有效坐标</small>}
      </div>
    )
  }

  const unscheduledCount = plan.markers.filter(marker => marker.location.day === null).length

  return (
    <details className="map-legend">
      <summary aria-label="地图图例">图例</summary>
      <div className="map-legend-body">
        {plan.legendDays.map(item => (
          <span className="map-legend-chip" key={item.day}>
            <i style={{ background: item.color }} aria-hidden="true" />
            第 {item.day} 天 · {item.count} 处
          </span>
        ))}
        {unscheduledCount > 0 && (
          <span className="map-legend-chip">
            <i style={{ background: UNSCHEDULED_COLOR }} aria-hidden="true" />
            未排期 · {unscheduledCount} 处
          </span>
        )}
        <p className="map-legend-note">marker 数字 = 当天到访顺序</p>
        {plan.skippedCount > 0 && (
          <p className="map-legend-note">已显示 {plan.validCount} 个地点，另有 {plan.skippedCount} 个地点缺少有效坐标</p>
        )}
      </div>
    </details>
  )
}
