import CountUp from './CountUp'

export default function MetricTile({
  label, value, prefix = '', suffix = '', decimals = 0, raw,
}: { label: string; value?: number; prefix?: string; suffix?: string; decimals?: number; raw?: string }) {
  return (
    <div className="metric-tile px-4 pt-4 pb-3">
      <div className="text-[11.5px] uppercase tracking-wide font-semibold" style={{ color: '#9a8560' }}>{label}</div>
      <div className="text-[1.9rem] font-extrabold mt-1">
        {raw ?? <CountUp value={value ?? 0} prefix={prefix} suffix={suffix} decimals={decimals} />}
      </div>
    </div>
  )
}
