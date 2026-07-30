import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import { calculateRemaining, formatCurrency } from '../utils/currency'
import { notifyPayment, notifyUndo } from '../utils/telegram'

const UNDO_WINDOW_MS = 5 * 60 * 1000

export default function PaymentModal({ subscriber, onClose, onUpdated }) {
  const { user, canPay } = useAuth()
  const [amount, setAmount] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [lastPayment, setLastPayment] = useState(null)
  const [undoTimeLeft, setUndoTimeLeft] = useState(0)

  const remaining = calculateRemaining(subscriber)
  const fee = Number(subscriber?.subscription_fee) || 0
  const paid = Number(subscriber?.paid_amount) || 0

  useEffect(() => {
    if (!lastPayment) return

    const interval = setInterval(() => {
      const elapsed = Date.now() - lastPayment.timestamp
      const left = UNDO_WINDOW_MS - elapsed
      if (left <= 0) {
        setUndoTimeLeft(0)
        setLastPayment(null)
        clearInterval(interval)
      } else {
        setUndoTimeLeft(left)
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [lastPayment])

  const recordPayment = useCallback(async (paymentAmount) => {
    const previousPaid = paid
    const previousStatus = subscriber.status

    // Only insert into payment_history — the `trg_apply_payment` database
    // trigger reads the subscriber's current paid_amount as "previous" and
    // adds amount_paid on top, then writes the new paid_amount/status back.
    // Doing a manual .update() on `subscribers` here too (as this used to)
    // meant the trigger picked up the already-updated value as "previous"
    // and added the same payment again, doubling every recorded payment.
    const { error: historyError } = await supabase
      .from('payment_history')
      .insert({
        subscriber_id: subscriber.id,
        collector_id: user?.id || null,
        amount_paid: paymentAmount,
      })

    if (historyError) throw historyError

    const { data: freshSubscriber, error: fetchError } = await supabase
      .from('subscribers')
      .select('*')
      .eq('id', subscriber.id)
      .single()

    if (fetchError) throw fetchError

    const newRemaining = calculateRemaining(freshSubscriber)
    await notifyPayment(subscriber.name, paymentAmount, newRemaining, user?.username)

    setLastPayment({
      timestamp: Date.now(),
      amount: paymentAmount,
      previousPaid,
      previousStatus,
    })

    onUpdated(freshSubscriber)
  }, [subscriber, paid, user, onUpdated])

  const handleFullPay = async () => {
    if (!canPay) return
    setError('')
    setLoading(true)

    const paymentAmount = remaining
    if (paymentAmount <= 0) {
      setError('لا يوجد مبلغ متبقي للدفع')
      setLoading(false)
      return
    }

    try {
      await recordPayment(paymentAmount)
    } catch (err) {
      setError('حدث خطأ: ' + err.message)
    }
    setLoading(false)
  }

  const handlePartialPay = async (e) => {
    e.preventDefault()
    if (!canPay) return
    setError('')

    const paymentAmount = parseFloat(amount) || 0
    if (paymentAmount <= 0) {
      setError('يرجى إدخال مبلغ صحيح')
      return
    }
    if (paymentAmount > remaining) {
      setError('المبلغ يتجاوز المتبقي')
      return
    }

    setLoading(true)
    try {
      await recordPayment(paymentAmount)
      setAmount('')
    } catch (err) {
      setError('حدث خطأ: ' + err.message)
    }
    setLoading(false)
  }

  const handleUndo = async () => {
    if (!lastPayment) return
    setError('')
    setLoading(true)

    try {
      const { error: undoError } = await supabase
        .from('subscribers')
        .update({
          paid_amount: lastPayment.previousPaid,
          status: lastPayment.previousStatus,
          updated_at: new Date().toISOString(),
        })
        .eq('id', subscriber.id)

      if (undoError) throw undoError

      const { data: recentHistory } = await supabase
        .from('payment_history')
        .select('id')
        .eq('subscriber_id', subscriber.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (recentHistory) {
        await supabase.from('payment_history').delete().eq('id', recentHistory.id)
      }

      await notifyUndo(subscriber.name, lastPayment.previousPaid, lastPayment.previousStatus)

      setLastPayment(null)
      setUndoTimeLeft(0)

      onUpdated({
        ...subscriber,
        paid_amount: lastPayment.previousPaid,
        status: lastPayment.previousStatus,
      })
    } catch (err) {
      setError('حدث خطأ في التراجع: ' + err.message)
    }
    setLoading(false)
  }

  const formatTimeLeft = (ms) => {
    const seconds = Math.ceil(ms / 1000)
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${String(secs).padStart(2, '0')}`
  }

  const statusColors = {
    red: 'bg-danger-500/20 text-danger-300 border-danger-500/30',
    yellow: 'bg-warning-500/20 text-warning-300 border-warning-500/30',
    green: 'bg-success-500/20 text-success-300 border-success-500/30',
  }

  const statusLabels = {
    red: 'غير مسدد',
    yellow: 'جزئي',
    green: 'مسدد بالكامل',
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-slate-800 rounded-2xl border border-white/10 shadow-2xl animate-slide-up">
        <div className="flex items-center justify-between p-6 border-b border-white/10">
          <div>
            <h2 className="text-xl font-bold text-white">{subscriber.name}</h2>
            <span className={`inline-block mt-1 px-2 py-0.5 rounded-md text-xs font-medium border ${statusColors[subscriber.status]}`}>
              {statusLabels[subscriber.status]}
            </span>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-slate-700/30 rounded-xl p-3 text-center">
              <p className="text-xs text-slate-400 mb-1">رسوم الاشتراك</p>
              <p className="text-lg font-bold text-white">{formatCurrency(fee)}</p>
            </div>
            <div className="bg-slate-700/30 rounded-xl p-3 text-center">
              <p className="text-xs text-slate-400 mb-1">المدفوع</p>
              <p className="text-lg font-bold text-success-300">{formatCurrency(paid)}</p>
            </div>
            <div className="bg-slate-700/30 rounded-xl p-3 text-center">
              <p className="text-xs text-slate-400 mb-1">المتبقي</p>
              <p className="text-lg font-bold text-warning-300">{formatCurrency(remaining)}</p>
            </div>
          </div>

          {canPay && remaining > 0 && (
            <button
              onClick={handleFullPay}
              disabled={loading}
              className="w-full py-3 bg-success-600 hover:bg-success-700 disabled:opacity-50 text-white font-semibold rounded-xl transition-all shadow-lg shadow-success-600/20"
            >
              {loading ? 'جاري المعالجة...' : `تسديد المبلغ كاملاً (${formatCurrency(remaining)})`}
            </button>
          )}

          {canPay && remaining > 0 && (
            <form onSubmit={handlePartialPay} className="space-y-3">
              <div className="flex gap-2">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="flex-1 px-4 py-3 bg-slate-700/50 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500 transition-all"
                  placeholder="مبلغ جزئي"
                  disabled={loading}
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="px-6 py-3 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white font-semibold rounded-xl transition-all whitespace-nowrap"
                >
                  دفع جزئي
                </button>
              </div>
            </form>
          )}

          {remaining <= 0 && (
            <div className="bg-success-500/10 border border-success-500/30 rounded-xl px-4 py-3 text-success-200 text-center text-sm">
              تم تسديد كامل المبلغ
            </div>
          )}

          {lastPayment && undoTimeLeft > 0 && (
            <div className="bg-warning-500/10 border border-warning-500/30 rounded-xl p-4 animate-slide-up">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-sm text-warning-200 font-medium">تم تسجيل دفعة بمبلغ {formatCurrency(lastPayment.amount)}</p>
                  <p className="text-xs text-slate-400 mt-1">يمكنك التراجع خلال {formatTimeLeft(undoTimeLeft)}</p>
                </div>
                <div className="text-warning-300 text-2xl font-mono font-bold">
                  {formatTimeLeft(undoTimeLeft)}
                </div>
              </div>
              <button
                onClick={handleUndo}
                disabled={loading}
                className="w-full py-2.5 bg-warning-600 hover:bg-warning-700 disabled:opacity-50 text-white font-medium rounded-xl transition-all"
              >
                {loading ? 'جاري التراجع...' : 'تراجع عن العملية'}
              </button>
            </div>
          )}

          {error && (
            <div className="bg-danger-500/10 border border-danger-500/30 rounded-xl px-4 py-3 text-danger-100 text-sm">
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
