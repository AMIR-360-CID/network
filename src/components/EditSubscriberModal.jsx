import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { calculateStatus } from '../utils/currency'

export default function EditSubscriberModal({ subscriber, onClose, onUpdated }) {
  const [name, setName] = useState(subscriber.name || '')
  const [subscriptionFee, setSubscriptionFee] = useState(String(subscriber.subscription_fee ?? ''))
  const [paidAmount, setPaidAmount] = useState(String(subscriber.paid_amount ?? ''))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (!name.trim()) {
      setError('يرجى إدخال اسم المشترك')
      return
    }

    const fee = parseFloat(subscriptionFee) || 0
    const paid = parseFloat(paidAmount) || 0

    if (paid > fee) {
      setError('المبلغ المدفوع لا يمكن أن يكون أكبر من رسوم الاشتراك')
      return
    }

    setLoading(true)

    const status = calculateStatus({ subscription_fee: fee, paid_amount: paid })

    const { data, error: updateError } = await supabase
      .from('subscribers')
      .update({
        name: name.trim(),
        subscription_fee: fee,
        paid_amount: paid,
        status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', subscriber.id)
      .select()
      .single()

    if (updateError) {
      setError('حدث خطأ في تحديث البيانات: ' + updateError.message)
      setLoading(false)
      return
    }

    onUpdated(data)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-slate-800 rounded-2xl border border-white/10 shadow-2xl animate-slide-up">
        <div className="flex items-center justify-between p-6 border-b border-white/10">
          <h2 className="text-xl font-bold text-white">تعديل بيانات المشترك</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">اسم المشترك</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-3 bg-slate-700/50 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500 transition-all"
              placeholder="أدخل الاسم"
              disabled={loading}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">رسوم الاشتراك</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={subscriptionFee}
              onChange={(e) => setSubscriptionFee(e.target.value)}
              className="w-full px-4 py-3 bg-slate-700/50 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500 transition-all"
              placeholder="0"
              disabled={loading}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">المبلغ المدفوع</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={paidAmount}
              onChange={(e) => setPaidAmount(e.target.value)}
              className="w-full px-4 py-3 bg-slate-700/50 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500 transition-all"
              placeholder="0"
              disabled={loading}
            />
          </div>

          {error && (
            <div className="bg-danger-500/10 border border-danger-500/30 rounded-xl px-4 py-3 text-danger-100 text-sm">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-3 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white font-semibold rounded-xl transition-all"
            >
              {loading ? 'جاري الحفظ...' : 'حفظ التغييرات'}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-6 py-3 bg-slate-700 hover:bg-slate-600 text-slate-200 font-medium rounded-xl transition-all"
            >
              إلغاء
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
