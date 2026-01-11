// src/components/ImageCropModal.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react'
import Cropper from 'react-cropper'

export default function ImageCropModal({
  open,
  src,
  aspect = 1,
  title = 'Crop photo',
  mimeHint = 'image/jpeg',
  onCancel,
  onConfirm,
}) {
  const cropperRef = useRef(null)
  const [zoom, setZoom] = useState(1)

  const outMime = useMemo(() => {
    const m = (mimeHint || '').toLowerCase()
    return m.includes('png') ? 'image/png' : 'image/jpeg'
  }, [mimeHint])

  useEffect(() => {
    if (!open) return
    setZoom(1)
  }, [open])

  if (!open) return null

  const applyZoom = (z) => {
    const cropper = cropperRef.current?.cropper
    if (!cropper) return
    try {
      cropper.zoomTo(z)
    } catch {
      // ignore if not ready yet
    }
  }

  const handleConfirm = async () => {
    const cropper = cropperRef.current?.cropper
    if (!cropper) return

    const canvas = cropper.getCroppedCanvas({
      imageSmoothingEnabled: true,
      imageSmoothingQuality: 'high',
    })
    if (!canvas) return

    canvas.toBlob(
      (blob) => {
        if (!blob) return
        onConfirm?.(blob)
      },
      outMime,
      outMime === 'image/jpeg' ? 0.92 : undefined
    )
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={title}>
      <div
        className="modal-card"
        style={{
          width: 'min(920px, 100%)',
          maxHeight: 'calc(100vh - 36px)',
          overflow: 'hidden',
          padding: 12,
          gap: 10,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <div className="modal-title" style={{ margin: 0 }}>{title}</div>
          <button
            type="button"
            className="btn btn-neutral btn-pill"
            onClick={onCancel}
            style={{ flex: '0 0 auto' }}
          >
            Close
          </button>
        </div>

        <div
          style={{
            border: '1px solid var(--border)',
            borderRadius: 14,
            overflow: 'hidden',
            background: '#111',
            height: 'min(60vh, 520px)',
            width: '100%',
          }}
        >
          <Cropper
            ref={cropperRef}
            src={src}
            style={{ height: '100%', width: '100%' }}
            aspectRatio={aspect}
            initialAspectRatio={aspect}
            viewMode={1}
            dragMode="move"
            background={false}
            responsive={true}
            autoCropArea={1}
            guides={true}
            center={true}
            highlight={true}
            cropBoxMovable={true}
            cropBoxResizable={true}
            toggleDragModeOnDblclick={false}
            zoomOnWheel={true}
            zoomOnTouch={true}
            onReady={() => applyZoom(zoom)}
          />
        </div>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ fontWeight: 800 }}>Zoom</div>
          <input
            type="range"
            min="1"
            max="3"
            step="0.01"
            value={zoom}
            onChange={(e) => {
              const z = Number(e.target.value)
              setZoom(z)
              applyZoom(z)
            }}
            style={{ flex: '1 1 240px' }}
          />
          <div style={{ fontSize: 12, opacity: 0.7, minWidth: 44, textAlign: 'right' }}>
            {zoom.toFixed(2)}x
          </div>
        </div>

        <div className="modal-actions" style={{ justifyContent: 'space-between' }}>
          <button type="button" className="btn btn-neutral btn-pill" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary btn-pill" onClick={handleConfirm}>
            Use cropped photo
          </button>
        </div>
      </div>
    </div>
  )
}

}

