import { useId, useRef, useState } from 'react'
import { deleteNovelCoverFile, uploadNovelCover } from '../lib/novelsAdminApi.js'

const ACCEPT = 'image/jpeg,image/png,image/webp'
const MAX_BYTES = 1024 * 1024

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('读取图片失败'))
    reader.readAsDataURL(file)
  })
}

function validateCoverFile(file) {
  if (!file) throw new Error('请选择图片')
  const type = String(file.type || '').toLowerCase()
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(type)) {
    throw new Error('仅支持 JPG、PNG、WebP')
  }
  if (file.size > MAX_BYTES) throw new Error('图片不能超过 1MB')
}

export default function NovelCoverUpload({ coverUrl, onChange, disabled = false }) {
  const inputId = useId()
  const inputRef = useRef(null)
  const [uploading, setUploading] = useState(false)
  const [localError, setLocalError] = useState('')

  const pickFile = () => {
    if (disabled || uploading) return
    inputRef.current?.click()
  }

  const onFileChange = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setLocalError('')
    try {
      validateCoverFile(file)
      setUploading(true)
      const dataUrl = await readFileAsDataUrl(file)
      const result = await uploadNovelCover({ dataUrl, previousCoverUrl: coverUrl || '' })
      onChange?.(result.coverUrl || '')
    } catch (err) {
      setLocalError(err?.message || '上传失败')
    } finally {
      setUploading(false)
    }
  }

  const onRemove = async () => {
    if (disabled || uploading) return
    setLocalError('')
    const prev = String(coverUrl || '').trim()
    if (!prev) {
      onChange?.('')
      return
    }
    setUploading(true)
    try {
      await deleteNovelCoverFile(prev)
      onChange?.('')
    } catch (err) {
      setLocalError(err?.message || '删除失败')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="admin-cover-upload">
      <span className="admin-cover-upload__label">封面</span>
      <div className="admin-cover-upload__body">
        <div className="admin-cover-upload__preview" aria-hidden={!coverUrl}>
          {coverUrl ? (
            <img src={coverUrl} alt="封面预览" className="admin-cover-upload__img" />
          ) : (
            <div className="admin-cover-upload__placeholder">5:7</div>
          )}
        </div>
        <div className="admin-cover-upload__actions">
          <input
            ref={inputRef}
            id={inputId}
            type="file"
            accept={ACCEPT}
            className="admin-cover-upload__file"
            disabled={disabled || uploading}
            onChange={onFileChange}
          />
          <button
            type="button"
            className="admin-btn admin-btn-primary admin-cover-upload__btn"
            disabled={disabled || uploading}
            onClick={pickFile}
          >
            {uploading ? '处理中...' : coverUrl ? '更换封面' : '上传封面'}
          </button>
          {coverUrl ? (
            <button
              type="button"
              className="admin-btn admin-cover-upload__btn"
              disabled={disabled || uploading}
              onClick={onRemove}
            >
              删除封面
            </button>
          ) : null}
          <p className="admin-cover-upload__hint">
            比例 5:7，建议 600×840 或 1200×1680，JPG/WebP，≤1MB
          </p>
          {localError ? <p className="admin-cover-upload__error">{localError}</p> : null}
        </div>
      </div>
    </div>
  )
}
