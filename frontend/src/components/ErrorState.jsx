import { STATUS } from '../theme/chartColors'

export default function ErrorState({ message }) {
  return (
    <div
      className="rounded-xl border py-10 text-center text-sm text-[#0b0b0b]"
      style={{ borderColor: `${STATUS.critical}4d`, backgroundColor: `${STATUS.critical}0d` }}
    >
      <p className="font-medium">Couldn't load this dashboard's data.</p>
      {message && <p className="mt-1 text-[#52514e]">{message}</p>}
    </div>
  )
}
