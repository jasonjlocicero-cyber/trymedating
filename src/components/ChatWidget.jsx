// src/components/ChatWidget.jsx
import React from "react";
import ChatLauncher from "./ChatLauncher";

export default function ChatWidget({ disabled = false, onUnreadChange }) {
  return <ChatLauncher disabled={disabled} onUnreadChange={onUnreadChange || (() => {})} />;
}


