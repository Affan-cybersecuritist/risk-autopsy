import CountUp from './CountUp'

export default function MetricTile({
  label, value, prefix = '', suffix = '', decimals = 0, raw,
}: { label: string; value?: number; prefix?: string; suffix?: string; decimals?: number; raw?: string }) {
  return (
    <div className="metric-tile px-4 pt-4 pb-3">
      <div className="text-[11px] uppercase tracking-wide font-semibold" style={{ color: '#5C7370' }}>{label}</div>
      <div className="text-[1.65rem] font-semibold mt-1 font-mono" style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace" }}>
        {raw ?? <CountUp value={value ?? 0} prefix={prefix} suffix={suffix} decimals={decimals} />}
      </div>
    </div>
  )
}
