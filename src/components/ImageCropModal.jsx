// src/components/ImageCropModal.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react'
import Cropper from 'react-cropper'
import 'cropperjs/dist/cropper.css'

function extFromMime(mime) {
  if (!mime) return 'jpg'
  if (mime.includes('png')) return 'png'
  if (mime.includes('webp')) return 'webp'
  return 'jpg'
}

function mimeFromExt(ext) {
  const e = (ext || '').toLowerCase()
  if (e === 'png') return 'image/png'
  if (e === 'webp') return 'image/webp'
  return 'image/jpeg'
}

function baseName(name = 'photo.jpg') {
  return name.replace(/\.[^.]+$/, '')
}

async function canvasToFile(canvas, { type, quality, name }) {
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, type, quality))
  if (!blob) throw new Error('Could not create cropped image.')
  return new File([blob], name, { type })
}

export default function ImageCropModal({
  open,
  file,
  title = 'Crop photo',
  shape = 'rect', // "rect" | "circle"
  initialAspect = 4 / 5,
  aspectOptions = [
    { label: '4:5', value: 4 / 5 },
    { label: '1:1', value: 1 / 1 },
    { label: '16:9', value: 16 / 9 },
  ],
  onCancel,
  onConfirm,
}) {
  const cropperRef = useRef(null)

  const [src, setSrc] = useState('')
  const [aspect, setAspect] = useState(initialAspect)
  const [zoom, setZoom] = useState(1)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const isCircle = shape === 'circle'

  // Build image preview URL
  useEffect(() => {
    if (!open || !file) {
      setSrc('')
      return
    }
    const url = URL.createObjectURL(file)
    setSrc(url)
    return () => URL.revokeObjectURL(url)
  }, [open, file])

  // If circle, default to 1:1
  useEffect(() => {
    if (!open) return
    setErr('')
    setBusy(false)
    setZoom(1)
    setAspect(isCircle ? 1 : initialAspect)
  }, [open, isCircle, initialAspect])

  const aspectButtons = useMemo(() => {
    const opts = Array.isArray(aspectOptions) ? aspectOptions : []
    // Always include "Free"
    return [...opts, { label: 'Free', value: NaN }]
  }, [aspectOptions])

  if (!open) return null

  const cropper = cropperRef.current?.cropper

  const applyAspect = (val) => {
    setAspect(val)
    try {
      if (!cropper) return
      cropper.setAspectRatio(Number.isFinite(val) ? val : NaN)
    } catch {}
  }

  const applyZoom = (val) => {
    const z = Math.max(0.5, Math.min(3, val))
    setZoom(z)
    try {
      cropper?.zoomTo(z)
    } catch {}
  }

  const reset = () => {
    setErr('')
    setZoom(1)
    try {
      cropper?.reset()
      cropper?.zoomTo(1)
      cropper?.setAspectRatio(Number.isFinite(aspect) ? aspect : NaN)
    } catch {}
  }

  const confirm = async () => {
    setErr('')
    if (!cropper || !file) return

    setBusy(true)
    try {
      // Grab the cropped canvas
      const canvas = cropper.getCroppedCanvas({
        imageSmoothingEnabled: true,
        imageSmoothingQuality: 'high',
      })
      if (!canvas) throw new Error('Could not crop image.')

      // Optional: cap output size so uploads don’t get huge
      const MAX_DIM = 1600
      const w = canvas.width
      const h = canvas.height
      const scale = Math.min(1, MAX_DIM / Math.max(w, h))

      let outCanvas = canvas
      if (scale < 1) {
        const scaled = document.createElement('canvas')
        scaled.width = Math.round(w * scale)
        scaled.height = Math.round(h * scale)
        const ctx = scaled.getContext('2d')
        ctx.drawImage(canvas, 0, 0, scaled.width, scaled.height)
        outCanvas = scaled
      }

      // Decide output format
      // (PNG stays PNG, otherwise JPEG for smaller size)
      const originalExt = extFromMime(file.type)
      const outExt = originalExt === 'png' ? 'png' : 'jpg'
      const outType = mimeFromExt(outExt)

      const outName = `${baseName(file.name)}-cropped.${outExt}`

      const outFile = await canvasToFile(outCanvas, {
        type: outType,
        quality: outType === 'image/jpeg' ? 0.9 : 1,
        name: outName,
      })

      onConfirm?.(outFile)
    } catch (e) {
      setErr(e?.message || 'Crop failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="modal-backdrop"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.45)',
        display: 'grid',
        placeItems: 'center',
        padding: 16,
        zIndex: 300000,
      }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="modal-card"
        style={{
          width: 'min(860px, 100%)',
          background: '#fff',
          border: '1px solid var(--border)',
          borderRadius: 16,
          boxShadow: '0 18px 60px rgba(0,0,0,0.25)',
          padding: 12,
          display: 'grid',
          gap: 10,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
          <div style={{ fontWeight: 900, fontSize: 16 }}>{title}</div>
          <button
            type="button"
            onClick={() => onCancel?.()}
            className="btn btn-neutral btn-pill"
            style={{ padding: '8px 12px' }}
            disabled={busy}
          >
            Close
          </button>
        </div>

        {err ? (
          <div className="helper-error">{err}</div>
        ) : null}

        {/* Cropper */}
        <div
          className={isCircle ? 'tmd-cropper-circle' : 'tmd-cropper-rect'}
          style={{
            border: '1px solid var(--border)',
            borderRadius: 14,
            overflow: 'hidden',
            background: '#f8fafc',
            height: 'min(60vh, 520px)',
          }}
        >
          {src ? (
            <Cropper
              src={src}
              style={{ height: '100%', width: '100%' }}
              // IMPORTANT: This is what enables corner/edge resizing of the crop box
              cropBoxResizable
              cropBoxMovable
              dragMode="move"
              viewMode={1}
              background={false}
              responsive
              autoCropArea={1}
              checkOrientation={false}
              guides
              center
              toggleDragModeOnDblclick={false}
              aspectRatio={Number.isFinite(aspect) ? aspect : NaN}
              onInitialized={() => {
                try {
                  cropperRef.current?.cropper?.zoomTo(1)
                  cropperRef.current?.cropper?.setAspectRatio(Number.isFinite(aspect) ? aspect : NaN)
                } catch {}
              }}
              ref={cropperRef}
            />
          ) : (
            <div className="muted" style={{ padding: 14 }}>
              No image selected.
            </div>
          )}
        </div>

        {/* Controls */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <div className="muted" style={{ fontSize: 12, fontWeight: 800 }}>
              Aspect:
            </div>
            {aspectButtons.map((o) => {
              const active =
                (Number.isFinite(o.value) && Number.isFinite(aspect) && Math.abs(o.value - aspect) < 1e-9) ||
                (!Number.isFinite(o.value) && !Number.isFinite(aspect))
              return (
                <button
                  key={o.label}
                  type="button"
                  className={active ? 'btn btn-primary btn-pill' : 'btn btn-neutral btn-pill'}
                  onClick={() => applyAspect(o.value)}
                  disabled={busy}
                  style={{ padding: '8px 12px' }}
                >
                  {o.label}
                </button>
              )
            })}
          </div>

          <div style={{ flex: 1 }} />

          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <div className="muted" style={{ fontSize: 12, fontWeight: 800 }}>
              Zoom:
            </div>

            <button
              type="button"
              className="btn btn-neutral btn-pill"
              onClick={() => applyZoom(zoom - 0.1)}
              disabled={busy}
              style={{ padding: '8px 12px' }}
              title="Zoom out"
            >
              –
            </button>

            <input
              type="range"
              min={0.5}
              max={3}
              step={0.01}
              value={zoom}
              onChange={(e) => applyZoom(Number(e.target.value))}
              disabled={busy}
              style={{ width: 180 }}
              aria-label="Zoom"
            />

            <button
              type="button"
              className="btn btn-neutral btn-pill"
              onClick={() => applyZoom(zoom + 0.1)}
              disabled={busy}
              style={{ padding: '8px 12px' }}
              title="Zoom in"
            >
              +
            </button>

            <button
              type="button"
              className="btn btn-neutral btn-pill"
              onClick={reset}
              disabled={busy}
              style={{ padding: '8px 12px' }}
            >
              Reset
            </button>

            <button
              type="button"
              className="btn btn-primary btn-pill"
              onClick={confirm}
              disabled={busy || !src}
              style={{ padding: '8px 12px' }}
            >
              {busy ? 'Cropping…' : 'Use this crop'}
            </button>
          </div>
        </div>

        {/* Local styling for circle crop */}
        <style>{`
          .tmd-cropper-circle .cropper-view-box,
          .tmd-cropper-circle .cropper-face {
            border-radius: 50%;
          }
          .tmd-cropper-circle .cropper-line,
          .tmd-cropper-circle .cropper-point {
            opacity: 1;
          }
        `}</style>
      </div>
    </div>
  )
}

