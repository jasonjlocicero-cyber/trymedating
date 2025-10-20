// src/components/AttachmentButton.jsx
import React, { useRef } from "react";

/**
 * Paperclip button that lets a user pick a file.
 * Calls onPick(file) with the File object.
 * Now restricts chooser to images + PDFs via `accept`.
 */
export default function AttachmentButton({ onPick, disabled }) {
  const inputRef = useRef(null);

  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
        title="Attach file"
        style={{
          padding: "10px 12px",
          borderRadius: 12,
          border: "1px solid var(--border)",
          background: disabled ? "#cbd5e1" : "#f8fafc",
          cursor: disabled ? "not-allowed" : "pointer",
          fontWeight: 600,
        }}
      >
        📎
      </button>

      <input
        ref={inputRef}
        type="file"
        hidden
        accept="image/*,application/pdf"   // ← only images & PDFs
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f && onPick) onPick(f);
          e.target.value = ""; // reset so same file can be picked again
        }}
      />
    </>
  );
}
