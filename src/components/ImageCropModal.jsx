import React, { useMemo, useState } from "react";
import Cropper from "react-easy-crop";
import { getCroppedImageBlob } from "../lib/imageCrop";

export default function ImageCropModal({
  file,
  aspect = 1,
  title = "Crop photo",
  onCancel,
  onCropped,
  circle = false, // useful for avatars (preview only)
  maxSize = 2048, // optional downscale cap
}) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const [busy, setBusy] = useState(false);

  const imageSrc = useMemo(() => (file ? URL.createObjectURL(file) : ""), [file]);

  async function handleCrop() {
    if (!file || !croppedAreaPixels) return;
    setBusy(true);
    try {
      const blob = await getCroppedImageBlob(imageSrc, croppedAreaPixels, {
        mime: "image/jpeg",
        quality: 0.92,
        maxSize,
      });

      // Keep a sane filename
      const base = (file.name || "photo").replace(/\.[^.]+$/, "");
      const croppedFile = new File([blob], `${base}-cropped.jpg`, { type: blob.type });

      onCropped?.(croppedFile);
    } catch (e) {
      alert(e?.message || "Failed to crop image.");
    } finally {
      setBusy(false);
    }
  }

  // cleanup object URL when modal closes is handled by React when component unmounts;
  // if you want extra safety, you can revoke it in a useEffect cleanup.

  if (!file) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 999999,
        background: "rgba(0,0,0,0.55)",
        display: "grid",
        placeItems: "center",
        padding: 12,
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
        <div style={{ padding: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontWeight: 900 }}>{title}</div>
          <button
            type="button"
            onClick={onCancel}
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              border: "1px solid var(--border)",
              background: "#fff",
              cursor: "pointer",
              fontWeight: 900,
            }}
            aria-label="Close"
            title="Close"
          >
            ✕
          </button>
        </div>

        <div style={{ position: "relative", height: "min(60vh, 420px)", background: "#111" }}>
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={aspect}
            cropShape={circle ? "round" : "rect"}
            showGrid={!circle}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={(_, areaPixels) => setCroppedAreaPixels(areaPixels)}
          />
        </div>

        <div style={{ padding: 12, display: "grid", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ fontWeight: 800, fontSize: 13, minWidth: 48 }}>Zoom</div>
            <input
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              style={{ width: "100%" }}
            />
          </div>

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
            <button type="button" className="btn btn-neutral btn-pill" onClick={onCancel} disabled={busy}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary btn-pill" onClick={handleCrop} disabled={busy}>
              {busy ? "Cropping…" : "Crop & Use Photo"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
