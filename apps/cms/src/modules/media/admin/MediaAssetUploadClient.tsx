'use client'

import { useState, type FormEvent } from 'react'

import styles from './media-upload.module.css'

type Result = { byteSize: number; height: number; id: string; width: number }

export function MediaAssetUploadClient() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<Result | null>(null)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setResult(null)
    const input = event.currentTarget.elements.namedItem('file')
    const file = input instanceof HTMLInputElement ? input.files?.[0] : null
    if (!file) {
      setError('请选择图片。')
      setBusy(false)
      return
    }
    try {
      const response = await fetch('/api/v1/admin/media-assets/upload', {
        body: file,
        headers: { 'content-type': file.type },
        method: 'POST',
      })
      const body = (await response.json()) as Result & { message?: string }
      if (!response.ok)
        throw new Error(body.message ?? '上传失败，请稍后重试。')
      setResult(body)
      event.currentTarget.reset()
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : '上传失败，请稍后重试。',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className={styles.page}>
      <h1>上传媒体资产</h1>
      <p>
        仅接受 JPEG、静态 PNG、静态 WebP，最大 10
        MiB。系统只保存四个经方向规范、移除来源元数据且不裁切的 WebP
        站点版本；摄影原件不会保留。
      </p>
      <p>
        上传完成后请在协会画廊草稿中选择资产、作者及可选笔名，并确认展示权和可识别人像许可后再发布。
      </p>
      <form className={styles.form} onSubmit={submit}>
        <label htmlFor="media-file">站点展示图片</label>
        <input
          accept="image/jpeg,image/png,image/webp"
          disabled={busy}
          id="media-file"
          name="file"
          required
          type="file"
        />
        <button disabled={busy} type="submit">
          {busy ? '正在安全处理…' : '上传并生成站点版本'}
        </button>
      </form>
      <div aria-live="polite">
        {error ? <p role="alert">{error}</p> : null}
        {result ? (
          <p>
            上传完成：资产 {result.id}，主展示尺寸 {result.width} ×{' '}
            {result.height}，{result.byteSize} 字节。
          </p>
        ) : null}
      </div>
    </main>
  )
}
