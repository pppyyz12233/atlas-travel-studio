import { ArrowRight, CalendarDays, MapPinned, Radio, Users, Wallet } from 'lucide-react'
import MapView from '../../components/MapView'
import type { MapApi } from '../../components/MapView'
import type { Location } from '../../types'
import type { DayPlan } from './viewModel'
import type { JourneyPhase, JourneyStep, TripForm } from './model'
import OrchestrationTimeline from './OrchestrationTimeline'

interface JourneyContextPanelProps {
  form: TripForm
  locations: Location[]
  steps: JourneyStep[]
  phase: JourneyPhase
  progress: number
  /** 逐日行程：驱动地图编号 / 每日分组 / 折线 */
  days?: DayPlan[]
  onMapReady?: (api: MapApi) => void
}

const phaseLabels: Record<JourneyPhase, string> = {
  idle: '等待任务',
  planning: '实时执行',
  ready: '执行完成',
  error: '执行异常',
  cancelled: '执行停止',
}

export default function JourneyContextPanel({
  form,
  locations,
  steps,
  phase,
  progress,
  days,
  onMapReady,
}: JourneyContextPanelProps) {
  return (
    <div className="atlas-context-panel">
      <header className="atlas-context-header">
        <div>
          <span><Radio size={13} aria-hidden="true" /> 实时执行地图</span>
          <h2>{form.destination || '目的地'}行动地图</h2>
        </div>
        <span className={`atlas-context-state is-${phase}`}><i aria-hidden="true" />{phaseLabels[phase]}</span>
      </header>

      <div className="atlas-map-frame">
        <MapView locations={locations} days={days} onMapReady={onMapReady} />
        <span className="atlas-map-label"><MapPinned size={13} aria-hidden="true" /> {locations.length} 个真实坐标</span>
      </div>

      <div className="atlas-context-scroll">
        <section className="atlas-route-manifest" aria-label="路线清单">
          <span className="atlas-kicker">路线概览</span>
          <div className="atlas-manifest-route">
            <strong>{form.origin.label || '出发地'}</strong>
            <span aria-hidden="true"><i /><ArrowRight size={15} /><i /></span>
            <strong>{form.destination || '目的地'}</strong>
          </div>
          <div className="atlas-manifest-metrics">
            <span><CalendarDays size={15} aria-hidden="true" /><b>{form.days} 天</b><small>{form.date}</small></span>
            <span><Users size={15} aria-hidden="true" /><b>{form.people} 人</b><small>旅行成员</small></span>
            <span><Wallet size={15} aria-hidden="true" /><b>¥{form.budget.toLocaleString()}</b><small>人均预算</small></span>
          </div>
        </section>

        <div className="atlas-context-trace-heading">
          <span>智能体执行</span>
          <small>{steps.length > 0 ? `${progress}%` : 'STANDBY'}</small>
        </div>
        <OrchestrationTimeline
          steps={steps}
          graphNode=""
          phase={phase}
          statusMessage=""
          onRetry={() => undefined}
          onEditBrief={() => undefined}
          compact
        />
      </div>
    </div>
  )
}
