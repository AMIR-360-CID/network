import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import { notifyUndo } from '../utils/telegram'

const UNDO_WINDOW_MS = 5 * 60 * 1000

export default function UndoButton({ lastAction, onUndoComplete }) {
  const { user } = useAuth()
  const [timeLeft, setTimeLeft] = useState(0)
  const [loading, setLoading] = useState(false)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!lastAction) {
      setVisible(false)
      return
    }

    const elapsed = Date.now() - lastAction.timestamp
    const left = UNDO_WINDOW_MS - elapsed

    if (left <= 0) {
      setVisible(false)
      return
    }

    setVisible(true)
    setTimeLeft(left)

    const interval = setInterval(() => {
      const newLeft = UNDO_WINDOW_MS - (Date.now() - lastAction.timestamp)
      if (newLeft <= 0) {
        setVisible(false)
        setTimeLeft(0)
        clearInterval(interval)
      } else {
        setTimeLeft(newLeft)
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [lastAction])

  const handleUndo = useCallback(async () => {
    if (!lastAction) return
    setLoading(true)

    try {
      const { error } = await supabase
        .from('subscribers')
        .update({
          paid_amount: lastAction.previousPaid,
          status: lastAction.previousStatus,
          updated_at: new Date().toISOString(),
        })
        .eq('id', lastAction.subscriberId)

      if (error) throw error

      const { data: recentHistory } = await supabase
        .from('payment_history')
        .select('id')
        .eq('subscriber_id', lastAction.subscriberId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (recentHistory) {
        await supabase.from('payment_history').delete().eq('id', recentHistory.id)
      }

      await notifyUndo(lastAction.subscriberName, lastAction.previousPaid, lastAction.previousStatus)

      setVisible(false)
      onUndoComplete?.()
    } catch (err) {
      console.error('Undo failed:', err.message)
    }
    setLoading(false)
  }, [lastAction, onUndoComplete])

  if (!visible) return null

  const seconds = Math.ceil(timeLeft / 1000)
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60

  return (
    <div className="fixed bottom-6 left-6 z-40 animate-slide-up">
      <div className="bg-slate-800 border border-warning-500/30 rounded-2xl shadow-2xl p-4 flex items-center gap-4">
        <div className="w-10 h-10 bg-warning-500/20 rounded-full flex items-center justify-center">
          <svg className="w-5 h-5 text-warning-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
          </svg>
        </div>
        <div className="text-right">
          <p className="text-sm text-white font-medium">تراجع عن آخر عملية</p>
          <p className="text-xs text-slate-400">{lastAction?.subscriberName} - متبقي {mins}:{String(secs).padStart(2, '0')}</p>
        </div>
        <button
          onClick={handleUndo}
          disabled={loading}
          className="px-4 py-2 bg-warning-600 hover:bg-warning-700 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-all whitespace-nowrap"
        >
          {loading ? '...' : 'تراجع'}
        </button>
      </div>
    </div>
  )
}
