import { useEffect, useRef, useState } from 'react'
import { BRAND } from '../theme/brand'

/**
 * Header "Ask Anything" control (renamed from "Ask AI" at the user's
 * request) — a violet pill button, top-right corner, that opens a dropdown
 * with the question input. `onAsk(question)` returns the answer string,
 * computed by real rule-based logic against the page's loaded data (see
 * utils/askAnything.js) — this is genuinely functional, not a placeholder.
 */
export default function AskAi({ onAsk }) {
  const [open, setOpen] = useState(false)
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState(null)
  const ref = useRef(null)

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function handleSubmit(e) {
    e.preventDefault()
    const trimmed = question.trim()
    if (!trimmed) return
    setAnswer(onAsk ? onAsk(trimmed) : "Ask Anything isn't wired up on this page yet.")
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Ask anything about this dashboard's data"
        className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold text-white shadow-sm"
        style={{ backgroundColor: BRAND.primary }}
      >
        Ask Anything
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-2 w-96 rounded-xl border border-slate-200 bg-white p-4 shadow-lg">
          <h3 className="mb-2 text-sm font-semibold text-[#0b0b0b]">Ask Anything</h3>
          <form onSubmit={handleSubmit} className="flex gap-2">
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="e.g. What's the no-show rate at Elkridge?"
              className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none"
              autoFocus
            />
            <button type="submit" className="rounded-lg px-4 py-2 text-sm font-medium text-white" style={{ backgroundColor: BRAND.primary }}>
              Ask
            </button>
          </form>
          {answer && <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-[#0b0b0b]">{answer}</p>}
        </div>
      )}
    </div>
  )
}
