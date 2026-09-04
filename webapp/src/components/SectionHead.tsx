export default function SectionHead({ number, title, subtitle }: { number: string | number; title: string; subtitle?: string }) {
  return (
    <div className="flex items-baseline gap-3 mb-5">
      <div
        className="flex-none w-6 h-6 rounded-[6px] flex items-center justify-center text-white text-[12px] font-mono"
        style={{ background: '#2B5D5E' }}
      >
        {number}
      </div>
      <div>
        <div className="text-[21px] font-semibold leading-tight" style={{ fontFamily: "'Fraunces', serif" }}>{title}</div>
        {subtitle && <div className="text-[13px] mt-1" style={{ color: '#5C7370' }}>{subtitle}</div>}
      </div>
    </div>
  )
}
