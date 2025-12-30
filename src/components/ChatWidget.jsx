// src/components/ChatWidget.jsx
import React from "react";
import ChatLauncher from "./ChatLauncher";

/**
 * ChatLauncher now owns the full “floating button + panel” behavior.
 * Keeping ChatWidget as a thin wrapper avoids the old portal/fixed stacking conflicts.
 */
export default function ChatWidget({ disabled = false }) {
  return <ChatLauncher disabled={disabled} />;
}

