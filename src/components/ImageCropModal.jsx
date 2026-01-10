// src/components/ImageCropModal.jsx
import React, { useEffect, useMemo, useState } from "react";
import Cropper from "react-easy-crop";
import { getCroppedBlob } from "../lib/cropImage";

function extForMime(mime) {
  const m = (mime || "").toLowerCase();
  if (m.includes("png")) return "png";
  if (m.includes("webp")) return "webp";
  if (m.includes("jpeg") || m.includes("jpg")) return "jpg";
  return "jpg";
}

function safeOutputType(inputType) {
  const t = (inputType || "").toLowerCase();
  if (t === "image/png" || t === "image/webp" || t === "image/jpeg") return t;
  // Default to jpeg for widest support
  return "image/jpeg";
}

export default function ImageCropModal({
  open,
  file,
  title = "Crop photo",
  shape = "rect", // "rect" | "round"
  initialAspect = 1,
  aspectOptions = [
    { label: "1:1", value: 1 / 1 },
    { label: "4:5", value: 4 / 5 },
    { label: "16:9", value: 16 / 9 },
  ],
  onCancel,
  onConfirm, // (croppedFile: File) => void
}) {
  const [imgUrl, setImgUrl] = useState("");
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [aspect, setAspect] = useState(initialAspect);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const [busy, setBusy] = useState(false);
  const outputType = useMemo(() => safeOutputType(file?.type), [file?.type]);

  useEffect(() => {
    if (!open || !file) return;

    const url = URL.createObjectURL(file);
    setImgUrl(url);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setRotation(0);
    setAspect(initialAspect);
    setCroppedAreaPixels(null);
    setBusy(false);

    return () => {
      try {
        URL.revokeObjectURL(url);
      } catch {}
    };
  }, [open, file, initialAspect]);

  const doConfirm = async () => {
    if (!imgUrl || !croppedAreaPixels || !file) return;
    setBusy(true);
    try {
      const blob = await getCroppedBlob(imgUrl, croppedAreaPixels, rotation, outputType, 0.92);

      const ext = extForMime(blob.type || outputType);
      const baseName = (file.name || "photo").replace(/\.[^/.]+$/, "");
      const outName = `${baseName}-cropped.${ext}`;
      const outFile = new File([blob], outName, { type: blob.type || outputType });

      onConfirm?.(outFile);
    } catch (e) {
      alert(e?.message || "Failed to crop image.");
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

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
          width: "min(760px, 100%)",
          background: "#fff",
          borderRadius: 16,
          border: "1px solid var(--border)",
          boxShadow: "0 18px 60px rgba(0,0,0,0.25)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "12px 14px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            borderBottom: "1px solid var(--border)",
          }}
        >
          <div style={{ fontWeight: 900 }}>{title}</div>
          <button
            type="button"
            onClick={() => (busy ? null : onCancel?.())}
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              border: "1px solid var(--border)",
              background: "#fff",
              cursor: busy ? "not-allowed" : "pointer",
              fontWeight: 900,
            }}
            aria-label="Close"
            title="Close"
            disabled={busy}
          >
            ✕
          </button>
        </div>

        <div style={{ padding: 14, display: "grid", gap: 12 }}>
          <div
            style={{
              position: "relative",
              width: "100%",
              height: "min(56vh, 420px)",
              background: "#0b1220",
              borderRadius: 12,
              overflow: "hidden",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            {imgUrl ? (
              <Cropper
                image={imgUrl}
                crop={crop}
                zoom={zoom}
                rotation={rotation}
                aspect={aspect}
                cropShape={shape === "round" ? "round" : "rect"}
                showGrid={true}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onRotationChange={setRotation}
                onCropComplete={(_, croppedPixels) => setCroppedAreaPixels(croppedPixels)}
              />
            ) : null}
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            <div style={{ fontWeight: 800, fontSize: 13, marginRight: 6 }}>Aspect</div>
            {aspectOptions.map((opt) => (
              <button
                key={opt.label}
                type="button"
                onClick={() => setAspect(opt.value)}
                disabled={busy}
                className="btn btn-neutral btn-pill"
                style={{
                  opacity: busy ? 0.6 : 1,
                  borderColor: Math.abs(aspect - opt.value) < 0.0001 ? "var(--brand-teal)" : undefined,
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div style={{ display: "grid", gap: 10 }}>
            <label style={{ display: "grid", gap: 6, fontWeight: 800, fontSize: 13 }}>
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

            <label style={{ display: "grid", gap: 6, fontWeight: 800, fontSize: 13 }}>
              Rotation
              <input
                type="range"
                min={0}
                max={360}
                step={1}
                value={rotation}
                onChange={(e) => setRotation(Number(e.target.value))}
                disabled={busy}
              />
            </label>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => (busy ? null : onCancel?.())}
              className="btn btn-neutral btn-pill"
              disabled={busy}
              style={{ opacity: busy ? 0.6 : 1 }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={doConfirm}
              className="btn btn-primary btn-pill"
              disabled={busy || !croppedAreaPixels}
              style={{ opacity: busy || !croppedAreaPixels ? 0.6 : 1 }}
            >
              {busy ? "Cropping…" : "Use photo"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

