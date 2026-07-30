export function formatCurrency(amount) {
  const num = Number(amount) || 0
  return new Intl.NumberFormat('ar', {
    style: 'decimal',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(num)
}

export function calculateRemaining(subscriber) {
  const fee = Number(subscriber?.subscription_fee) || 0
  const paid = Number(subscriber?.paid_amount) || 0
  return Math.max(0, fee - paid)
}

export function calculateStatus(subscriber) {
  const fee = Number(subscriber?.subscription_fee) || 0
  const paid = Number(subscriber?.paid_amount) || 0
  if (paid <= 0) return 'red'
  if (paid >= fee) return 'green'
  return 'yellow'
}
