// src/components/ImageCropModal.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import Cropper from "react-cropper";
import "cropperjs/dist/cropper.css";

/**
 * Simple modal wrapper around react-cropper (cropperjs)
 * - Drag to reposition
 * - Resize crop box by sides/corners
 * - Zoom slider (mobile-friendly)
 *
 * Props:
 *  open: boolean
 *  file: File | null
 *  title?: string
 *  aspect?: number (default 1)
 *  outputSize?: number (default 1080) => output will be square outputSize x outputSize if aspect=1
 *  onCancel: () => void
 *  onConfirm: (croppedFile: File) => void
 */
export default function ImageCropModal({
  open,
  file,
  title = "Crop photo",
  aspect = 1,
  outputSize = 1080,
  onCancel,
  onConfirm,
}) {
  const cropperRef = useRef(null);
  const [zoom, setZoom] = useState(1);

  const objectUrl = useMemo(() => {
    if (!file) return "";
    return URL.createObjectURL(file);
  }, [file]);

  useEffect(() => {
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [objectUrl]);

  useEffect(() => {
    // reset zoom each time a new image opens
    if (open) setZoom(1);
  }, [open, file]);

  if (!open || !file) return null;

  const close = () => {
    try {
      onCancel?.();
    } catch {}
  };

  const confirm = async () => {
    const cropper = cropperRef.current?.cropper;
    if (!cropper) {
      onConfirm?.(file);
      return;
    }

    // If aspect is 1, output square. If not, still constrain largest dimension to outputSize.
    const canvasOptions = {
      imageSmoothingEnabled: true,
      imageSmoothingQuality: "high",
    };

    let canvas;
    try {
      if (aspect === 1) {
        canvas = cropper.getCroppedCanvas({
          width: outputSize,
          height: outputSize,
          ...canvasOptions,
        });
      } else {
        // Compute output dims that preserve aspect with max dimension = outputSize
        const data = cropper.getData(true);
        const w = Math.max(1, Math.round(data.width));
        const h = Math.max(1, Math.round(data.height));
        const scale = outputSize / Math.max(w, h);
        const outW = Math.max(1, Math.round(w * scale));
        const outH = Math.max(1, Math.round(h * scale));

        canvas = cropper.getCroppedCanvas({
          width: outW,
          height: outH,
          ...canvasOptions,
        });
      }
    } catch {
      onConfirm?.(file);
      return;
    }

    if (!canvas) {
      onConfirm?.(file);
      return;
    }

    const nameBase = (file.name || "photo").replace(/\.[^.]+$/, "");
    const outName = `${nameBase}-cropped.jpg`;

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          onConfirm?.(file);
          return;
        }
        const croppedFile = new File([blob], outName, { type: "image/jpeg" });
        onConfirm?.(croppedFile);
      },
      "image/jpeg",
      0.92
    );
  };

  const overlayStyle = {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.55)",
    zIndex: 200000,
    display: "grid",
    placeItems: "center",
    padding: 14,
  };

  const cardStyle = {
    width: "min(920px, 100%)",
    background: "#fff",
    border: "1px solid var(--border)",
    borderRadius: 16,
    boxShadow: "0 18px 60px rgba(0,0,0,0.25)",
    overflow: "hidden",
    display: "grid",
    gridTemplateRows: "auto 1fr auto",
  };

  const headerStyle = {
    padding: "12px 14px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    borderBottom: "1px solid var(--border)",
  };

  const bodyStyle = {
    padding: 12,
    display: "grid",
    gap: 10,
  };

  const footerStyle = {
    padding: "12px 14px",
    borderTop: "1px solid var(--border)",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  };

  const btnStyle = (tone) => {
    const base = {
      borderRadius: 12,
      padding: "10px 14px",
      fontWeight: 800,
      border: "1px solid var(--border)",
      cursor: "pointer",
    };
    if (tone === "primary") return { ...base, background: "var(--brand-teal)", color: "#fff" };
    if (tone === "neutral") return { ...base, background: "#f3f4f6", color: "#111827" };
    return { ...base, background: "#fff", color: "#111827" };
  };

  return (
    <div style={overlayStyle} role="dialog" aria-modal="true" aria-label={title}>
      <div style={cardStyle}>
        <div style={headerStyle}>
          <div style={{ fontWeight: 900, fontSize: 16 }}>{title}</div>
          <button type="button" onClick={close} aria-label="Close" title="Close" style={btnStyle("neutral")}>
            ✕
          </button>
        </div>

        <div style={bodyStyle}>
          <div
            style={{
              width: "100%",
              height: "min(70vh, 520px)",
              background: "#111",
              borderRadius: 14,
              overflow: "hidden",
              border: "1px solid var(--border)",
            }}
          >
            <Cropper
              ref={cropperRef}
              src={objectUrl}
              style={{ height: "100%", width: "100%" }}
              aspectRatio={aspect}
              viewMode={1}
              dragMode="move"
              guides
              background={false}
              responsive
              autoCropArea={1}
              checkOrientation={true}
              cropBoxMovable={true}
              cropBoxResizable={true}
              toggleDragModeOnDblclick={false}
              onInitialized={(instance) => {
                // make sure zoom starts at 1
                try {
                  instance.zoomTo(1);
                } catch {}
              }}
            />
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            <div style={{ fontWeight: 800, fontSize: 13 }}>Zoom</div>
            <input
              type="range"
              min="1"
              max="3"
              step="0.01"
              value={zoom}
              onChange={(e) => {
                const z = Number(e.target.value || 1);
                setZoom(z);
                const cropper = cropperRef.current?.cropper;
                if (cropper) {
                  try {
                    cropper.zoomTo(z);
                  } catch {}
                }
              }}
            />
            <div className="muted" style={{ fontSize: 12 }}>
              Drag to reposition. Resize the crop box by edges/corners.
            </div>
          </div>
        </div>

        <div style={footerStyle}>
          <button type="button" onClick={close} style={btnStyle("neutral")}>
            Cancel
          </button>
          <button type="button" onClick={confirm} style={btnStyle("primary")}>
            Use photo
          </button>
        </div>
      </div>
    </div>
  );
}

