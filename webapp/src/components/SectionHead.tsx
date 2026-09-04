export default function SectionHead({ number, title, subtitle }: { number: string | number; title: string; subtitle?: string }) {
  return (
    <div className="flex items-center gap-4 mb-5">
      <div
        className="flex-none w-11 h-11 rounded-[13px] flex items-center justify-center text-white font-extrabold text-[17px]"
        style={{ background: 'linear-gradient(135deg,#D4AF37,#B8860B)', boxShadow: '0 10px 22px rgba(184,134,11,0.35)' }}
      >
        {number}
      </div>
      <div>
        <div className="text-2xl font-extrabold leading-tight">{title}</div>
        {subtitle && <div className="text-[13.5px] text-neutral-500 mt-0.5">{subtitle}</div>}
      </div>
    </div>
  )
}
