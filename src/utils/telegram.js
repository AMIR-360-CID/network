const TELEGRAM_BOT_TOKEN = import.meta.env.VITE_TELEGRAM_BOT_TOKEN
const TELEGRAM_ADMIN_CHAT_ID = import.meta.env.VITE_TELEGRAM_ADMIN_CHAT_ID
const TELEGRAM_COLLECTOR_CHAT_ID = import.meta.env.VITE_TELEGRAM_COLLECTOR_CHAT_ID

// Unique, defined chat IDs to notify.
const TELEGRAM_CHAT_IDS = [...new Set([TELEGRAM_ADMIN_CHAT_ID, TELEGRAM_COLLECTOR_CHAT_ID].filter(Boolean))]

export function isTelegramConfigured() {
  return Boolean(TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_IDS.length > 0)
}

async function sendToChat(chatId, text) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
      }),
    })

    if (!response.ok) {
      const errorBody = await response.text()
      console.error('Telegram API error:', response.status, errorBody)
      return { success: false, error: `Telegram API error: ${response.status}` }
    }

    const data = await response.json()
    if (!data.ok) {
      console.error('Telegram response not ok:', data)
      return { success: false, error: data.description || 'Unknown Telegram error' }
    }

    return { success: true }
  } catch (err) {
    console.error('Telegram fetch failed:', err.message)
    return { success: false, error: err.message }
  }
}

export async function sendTelegramMessage(text) {
  if (!isTelegramConfigured()) {
    console.warn('Telegram not configured: missing BOT_TOKEN or a CHAT_ID')
    return { success: false, error: 'Telegram not configured' }
  }

  const results = await Promise.all(TELEGRAM_CHAT_IDS.map((chatId) => sendToChat(chatId, text)))
  const failed = results.find((r) => !r.success)
  return failed ?? { success: true }
}

export async function notifyPayment(subscriberName, amountPaid, remaining, collectorName) {
  const lines = [
    '<b>✅ تم تسديد دفعة</b>',
    '',
    `<b>المشترك:</b> ${escapeHtml(subscriberName)}`,
    `<b>المبلغ المدفوع:</b> ${amountPaid}`,
    `<b>المتبقي:</b> ${remaining}`,
  ]
  if (collectorName) {
    lines.push(`<b>بواسطة:</b> ${escapeHtml(collectorName)}`)
  }
  lines.push(`<b>التاريخ:</b> ${new Date().toLocaleString('ar')}`)

  return sendTelegramMessage(lines.join('\n'))
}

export async function notifyNewSubscriber(subscriberName, fee) {
  const text = [
    '<b>🔔 مشترك جديد</b>',
    '',
    `<b>الاسم:</b> ${escapeHtml(subscriberName)}`,
    `<b>رسوم الاشتراك:</b> ${fee}`,
    `<b>التاريخ:</b> ${new Date().toLocaleString('ar')}`,
  ].join('\n')

  return sendTelegramMessage(text)
}

export async function notifyUndo(subscriberName, restoredAmount, restoredStatus) {
  const text = [
    '<b>↩️ تم التراجع عن عملية</b>',
    '',
    `<b>المشترك:</b> ${escapeHtml(subscriberName)}`,
    `<b>تم استعادة المبلغ:</b> ${restoredAmount}`,
    `<b>تم استعادة الحالة:</b> ${restoredStatus}`,
    `<b>التاريخ:</b> ${new Date().toLocaleString('ar')}`,
  ].join('\n')

  return sendTelegramMessage(text)
}

function escapeHtml(text) {
  if (text == null) return ''
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
