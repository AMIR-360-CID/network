import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import { calculateRemaining, calculateStatus, formatCurrency } from '../utils/currency'
import { notifyPayment } from '../utils/telegram'
import AddSubscriberModal from './AddSubscriberModal'
import PaymentModal from './PaymentModal'
import EditSubscriberModal from './EditSubscriberModal'
import UndoButton from './UndoButton'

export default function Dashboard() {
  const { user, canEdit, canDelete, canPay, isAdmin, isDataEntry } = useAuth()
  const [subscribers, setSubscribers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [showAddModal, setShowAddModal] = useState(false)
  const [paymentSubscriber, setPaymentSubscriber] = useState(null)
  const [editSubscriber, setEditSubscriber] = useState(null)
  const [lastAction, setLastAction] = useState(null)
  const [lastPayments, setLastPayments] = useState({})

  const fetchSubscribers = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const { data, error: fetchError } = await supabase
        .from('subscribers')
        .select('*')
        .order('created_at', { ascending: false })

      if (fetchError) throw fetchError

      setSubscribers(data || [])

      const { data: payments } = await supabase
        .from('payment_history')
        .select('subscriber_id, received_at')
        .order('received_at', { ascending: false })

      if (payments) {
        const latest = {}
        for (const p of payments) {
          if (!latest[p.subscriber_id]) {
            latest[p.subscriber_id] = p.received_at
          }
        }
        setLastPayments(latest)
      }
    } catch (err) {
      setError('فشل في جلب بيانات المشتركين: ' + err.message)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchSubscribers()
  }, [fetchSubscribers])

  const handleQuickPay = async (subscriber) => {
    if (!canPay) return

    const remaining = calculateRemaining(subscriber)
    if (remaining <= 0) return

    const previousPaid = Number(subscriber.paid_amount) || 0
    const previousStatus = subscriber.status

    try {
      // NOTE: only insert into payment_history — the `trg_apply_payment`
      // database trigger is the single source of truth for updating
      // subscribers.paid_amount/status. This used to ALSO run a manual
      // .update() on `subscribers` right before this insert, which made the
      // trigger read the already-updated row as "previous paid" and add the
      // payment on top a second time, silently doubling every payment.
      const { error: historyError } = await supabase
        .from('payment_history')
        .insert({
          subscriber_id: subscriber.id,
          collector_id: user?.id || null,
          amount_paid: remaining,
        })

      if (historyError) throw historyError

      const { data: freshSubscriber, error: fetchError } = await supabase
        .from('subscribers')
        .select('*')
        .eq('id', subscriber.id)
        .single()

      if (fetchError) throw fetchError

      await notifyPayment(subscriber.name, remaining, 0, user?.username)

      setLastAction({
        timestamp: Date.now(),
        subscriberId: subscriber.id,
        subscriberName: subscriber.name,
        previousPaid,
        previousStatus,
      })

      setSubscribers((prev) =>
        prev.map((s) => (s.id === subscriber.id ? freshSubscriber : s))
      )
      setPaymentSubscriber((prev) =>
        prev && prev.id === subscriber.id ? freshSubscriber : prev
      )
    } catch (err) {
      setError('حدث خطأ في تسجيل الدفعة: ' + err.message)
    }
  }

  const handleDelete = async (subscriber) => {
    if (!canDelete) return
    if (!confirm(`هل أنت متأكد من حذف المشترك "${subscriber.name}"؟`)) return

    try {
      const { error: deleteError } = await supabase
        .from('subscribers')
        .delete()
        .eq('id', subscriber.id)

      if (deleteError) throw deleteError

      setSubscribers((prev) => prev.filter((s) => s.id !== subscriber.id))
    } catch (err) {
      setError('حدث خطأ في الحذف: ' + err.message)
    }
  }

  const handleUndoComplete = () => {
    fetchSubscribers()
  }

  const handleSubscriberUpdated = (updated) => {
    setSubscribers((prev) =>
      prev.map((s) => (s.id === updated.id ? updated : s))
    )
    setPaymentSubscriber((prev) =>
      prev && prev.id === updated.id ? updated : prev
    )
  }

  const handleEditComplete = async (updated) => {
    setSubscribers((prev) =>
      prev.map((s) => (s.id === updated.id ? updated : s))
    )
    const { data: payments } = await supabase
      .from('payment_history')
      .select('subscriber_id, received_at')
      .eq('subscriber_id', updated.id)
      .order('received_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    setLastPayments((prev) => ({
      ...prev,
      [updated.id]: payments?.received_at || null,
    }))
  }

  const filtered = subscribers.filter((s) => {
    const matchesSearch = !search || s.name?.toLowerCase().includes(search.toLowerCase())
    const matchesStatus = statusFilter === 'all' || s.status === statusFilter
    return matchesSearch && matchesStatus
  })

  const stats = {
    total: subscribers.length,
    red: subscribers.filter((s) => s.status === 'red').length,
    yellow: subscribers.filter((s) => s.status === 'yellow').length,
    green: subscribers.filter((s) => s.status === 'green').length,
  }

  const statusConfig = {
    red: { label: 'غير مسدد', dot: 'bg-danger-500', badge: 'bg-danger-500/20 text-danger-300 border-danger-500/30' },
    yellow: { label: 'جزئي', dot: 'bg-warning-500', badge: 'bg-warning-500/20 text-warning-300 border-warning-500/30' },
    green: { label: 'مسدد', dot: 'bg-success-500', badge: 'bg-success-500/20 text-success-300 border-success-500/30' },
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-white mb-2">لوحة التحكم</h2>
          <p className="text-slate-400">إدارة المشتركين والمدفوعات</p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="bg-slate-800/50 border border-white/5 rounded-2xl p-5">
            <p className="text-sm text-slate-400 mb-1">إجمالي المشتركين</p>
            <p className="text-3xl font-bold text-white">{stats.total}</p>
          </div>
          <div className="bg-slate-800/50 border border-danger-500/20 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2 h-2 bg-danger-500 rounded-full"></span>
              <p className="text-sm text-slate-400">غير مسدد</p>
            </div>
            <p className="text-3xl font-bold text-danger-300">{stats.red}</p>
          </div>
          <div className="bg-slate-800/50 border border-warning-500/20 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2 h-2 bg-warning-500 rounded-full"></span>
              <p className="text-sm text-slate-400">جزئي</p>
            </div>
            <p className="text-3xl font-bold text-warning-300">{stats.yellow}</p>
          </div>
          <div className="bg-slate-800/50 border border-success-500/20 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2 h-2 bg-success-500 rounded-full"></span>
              <p className="text-sm text-slate-400">مسدد</p>
            </div>
            <p className="text-3xl font-bold text-success-300">{stats.green}</p>
          </div>
        </div>

        <div className="bg-slate-800/30 border border-white/5 rounded-2xl overflow-hidden">
          <div className="p-4 border-b border-white/5 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
            <div className="flex flex-1 gap-3">
              <div className="relative flex-1 max-w-xs">
                <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="بحث بالاسم..."
                  className="w-full pr-10 pl-4 py-2.5 bg-slate-700/50 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500 transition-all text-sm"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-4 py-2.5 bg-slate-700/50 border border-white/10 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-primary-500 transition-all text-sm cursor-pointer"
              >
                <option value="all">الكل</option>
                <option value="red">غير مسدد</option>
                <option value="yellow">جزئي</option>
                <option value="green">مسدد</option>
              </select>
            </div>

            {isAdmin && (
              <button
                onClick={() => setShowAddModal(true)}
                className="flex items-center gap-2 px-4 py-2.5 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-xl transition-all shadow-lg shadow-primary-600/20 text-sm whitespace-nowrap"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                إضافة مشترك
              </button>
            )}
          </div>

          {error && (
            <div className="m-4 bg-danger-500/10 border border-danger-500/30 rounded-xl px-4 py-3 text-danger-100 text-sm">
              {error}
            </div>
          )}

          {loading ? (
            <div className="p-12 flex items-center justify-center">
              <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center">
              <svg className="w-16 h-16 mx-auto text-slate-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <p className="text-slate-400">لا يوجد مشتركون لعرضهم</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/5">
                    <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">الاسم</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider hidden sm:table-cell">رسوم الاشتراك</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider hidden sm:table-cell">المدفوع</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">المتبقي</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">الحالة</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider hidden lg:table-cell">وقت التسديد</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filtered.map((subscriber) => {
                    const remaining = calculateRemaining(subscriber)
                    const config = statusConfig[subscriber.status]
                    return (
                      <tr key={subscriber.id} className="hover:bg-white/5 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-primary-600/20 border border-primary-500/30 rounded-full flex items-center justify-center text-primary-300 font-semibold text-xs">
                              {subscriber.name?.charAt(0)?.toUpperCase()}
                            </div>
                            <span className="text-sm font-medium text-white">{subscriber.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-300 hidden sm:table-cell">{formatCurrency(subscriber.subscription_fee)}</td>
                        <td className="px-4 py-3 text-sm text-success-300 hidden sm:table-cell">{formatCurrency(subscriber.paid_amount)}</td>
                        <td className="px-4 py-3 text-sm text-warning-300">{formatCurrency(remaining)}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border ${config.badge}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`}></span>
                            {config.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-400 hidden lg:table-cell">
                          {lastPayments[subscriber.id]
                            ? new Date(lastPayments[subscriber.id]).toLocaleString('ar')
                            : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {canEdit && (
                              <button
                                onClick={() => handleQuickPay(subscriber)}
                                disabled={remaining <= 0}
                                className="px-3 py-1.5 bg-success-600 hover:bg-success-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium rounded-lg transition-all whitespace-nowrap"
                                title={remaining > 0 ? 'تسديد المبلغ كاملاً' : 'لا يوجد مبلغ متبقي'}
                              >
                                تسديد
                              </button>
                            )}
                            {canEdit && (
                              <button
                                onClick={() => setPaymentSubscriber(subscriber)}
                                className="p-1.5 bg-primary-600/20 hover:bg-primary-600/30 text-primary-300 rounded-lg transition-all"
                                title="تفاصيل الدفع"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                              </button>
                            )}
                            {canEdit && (
                              <button
                                onClick={() => setEditSubscriber(subscriber)}
                                className="p-1.5 bg-warning-500/10 hover:bg-warning-500/20 text-warning-400 rounded-lg transition-all"
                                title="تعديل بيانات المشترك"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                              </button>
                            )}
                            {canDelete && (
                              <button
                                onClick={() => handleDelete(subscriber)}
                                className="p-1.5 bg-danger-500/10 hover:bg-danger-500/20 text-danger-400 rounded-lg transition-all"
                                title="حذف"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {showAddModal && (
        <AddSubscriberModal
          onClose={() => setShowAddModal(false)}
          onAdded={(newSub) => {
            setSubscribers((prev) => [newSub, ...prev])
          }}
        />
      )}

      {paymentSubscriber && (
        <PaymentModal
          subscriber={paymentSubscriber}
          onClose={() => setPaymentSubscriber(null)}
          onUpdated={handleSubscriberUpdated}
        />
      )}

      {editSubscriber && (
        <EditSubscriberModal
          subscriber={editSubscriber}
          onClose={() => setEditSubscriber(null)}
          onUpdated={handleEditComplete}
        />
      )}

      <UndoButton lastAction={lastAction} onUndoComplete={handleUndoComplete} />
    </div>
  )
}


export default Dashboard