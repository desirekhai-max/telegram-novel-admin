/** 后台统一中文错误文案（不直接展示可能乱码的服务端原文） */
export const API_ERRORS = {
  invalidCredentials: '账号、密码或动态码错误',
  legacyLoginFailed: 'Legacy 登录失败，请确认账号具备 Legacy 权限后重试。',
  legacyEmptyToken: 'Legacy 登录失败：未返回有效 Token，请稍后重试。',
  network: '无法连接后端服务，请检查网络或确认 API 服务已启动',
  otpRequired: '请填写账号、密码和 OTP',
  loginIncomplete: '登录未完成，请重新登录',
  loginTokensMissing: '登录失败：未同时获取 admin_token 与 admin_legacy_token',
}

const EN_ERROR_MAP = {
  'username/password/otp required': API_ERRORS.otpRequired,
  'admin unauthorized': '登录已过期，请重新登录',
  'legacy unauthorized': 'Legacy 登录已过期，请重新登录',
  'legacy admin unauthorized': 'Legacy 登录已过期（服务端重启后需重新登录），请点击下方按钮重新登录',
  'unsupported action': '服务端尚未支持 VIP 内购，请更新 APP 后重试',
  'planid required': '请选择 VIP 套餐',
  'invalid vip plan': '该套餐与当前用户身份不匹配，或套餐已下架',
  'vip purchase failed': 'VIP 内购开通失败，请稍后重试',
  'gift vip failed': 'VIP 内购开通失败，请稍后重试',
  'user not found': '未找到该用户',
}

/** 疑似 UTF-8 被当成 Latin-1 显示的乱码 */
function looksLikeMojibake(text) {
  return /[σµΦτÇπü»æè¿ΘöÖФ┤ª]/.test(text) && !/[\u4e00-\u9fff]/.test(text)
}

export function isNetworkFetchError(err) {
  const msg = String(err?.message || err || '').toLowerCase()
  return (
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    msg.includes('load failed') ||
    msg.includes('network request failed')
  )
}

/**
 * 将 API 返回的 error 转为可读中文；乱码或英文映射为固定文案。
 */
export function humanizeApiError(raw, fallback = '请求失败，请稍后重试') {
  const text = String(raw || '').trim()
  if (!text) return fallback
  if (isNetworkFetchError({ message: text })) return API_ERRORS.network
  if (looksLikeMojibake(text)) return fallback
  const lower = text.toLowerCase()
  if (EN_ERROR_MAP[text]) return EN_ERROR_MAP[text]
  if (EN_ERROR_MAP[lower]) return EN_ERROR_MAP[lower]
  if (lower.includes('legacy admin unauthorized') || lower.includes('legacy unauthorized')) {
    return EN_ERROR_MAP['legacy admin unauthorized']
  }
  if (/^[\x00-\x7F]+$/.test(text) && !EN_ERROR_MAP[text]) {
    return fallback
  }
  return text
}

export function isLegacyUnauthorizedMessage(message) {
  const lower = String(message || '').toLowerCase()
  return lower.includes('legacy admin unauthorized') || lower.includes('legacy unauthorized')
}

export function humanizeFetchError(err, fallback = API_ERRORS.network) {
  if (isNetworkFetchError(err)) return API_ERRORS.network
  return humanizeApiError(err?.message, fallback)
}
