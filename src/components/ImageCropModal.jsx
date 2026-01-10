// src/components/ImageCropModal.jsx
import React, { useEffect, useMemo, useState } from "react";
import Cropper from "react-easy-crop";
import { blobToFile, getCroppedImageBlob } from "../lib/cropImage";

export default function ImageCropModal({
  open,
  file,
  aspect = 1,
  round = true,
  title = "Crop photo",
  onCancel,
  onConfirm,
}) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const [busy, setBusy] = useState(false);

  const objectUrl = useMemo(() => {
    if (!file) return "";
    return URL.createObjectURL(file);
  }, [file]);

  useEffect(() => {
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [objectUrl]);

  if (!open || !file) return null;

  async function handleConfirm() {
    try {
      setBusy(true);
      const blob = await getCroppedImageBlob(objectUrl, croppedAreaPixels, {
        mimeType: file.type?.startsWith("image/") ? file.type : "image/jpeg",
        quality: 0.92,
      });

      const croppedFile = blobToFile(blob, file.name || "photo.jpg");
      onConfirm?.(croppedFile);
    } catch (e) {
      alert(e?.message || "Failed to crop image");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        zIndex: 200000,
        display: "grid",
        placeItems: "center",
        padding: 16,
      }}
    >
      <div
        style={{
          width: "min(720px, 100%)",
          background: "#fff",
          borderRadius: 16,
          border: "1px solid var(--border)",
          overflow: "hidden",
          boxShadow: "0 18px 60px rgba(0,0,0,0.25)",
        }}
      >
        <div
          style={{
            padding: 12,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <div style={{ fontWeight: 900 }}>{title}</div>
          <button
            type="button"
            className="btn btn-neutral btn-pill"
            onClick={onCancel}
            disabled={busy}
          >
            ✕
          </button>
        </div>

        <div
          style={{
            position: "relative",
            width: "100%",
            height: 420,
            background: "#111",
          }}
        >
          <Cropper
            image={objectUrl}
            crop={crop}
            zoom={zoom}
            aspect={aspect}
            cropShape={round ? "round" : "rect"}
            showGrid={!round}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={(_, pixels) => setCroppedAreaPixels(pixels)}
          />
        </div>

        <div style={{ padding: 12, display: "grid", gap: 10 }}>
          <label style={{ display: "grid", gap: 6, fontWeight: 800 }}>
            Zoom
            <input
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              disabled={busy}
            />
          </label>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button
              type="button"
              className="btn btn-neutral btn-pill"
              onClick={onCancel}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary btn-pill"
              onClick={handleConfirm}
              disabled={busy}
            >
              {busy ? "Cropping…" : "Use photo"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
