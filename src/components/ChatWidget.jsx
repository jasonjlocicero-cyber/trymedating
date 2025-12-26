// src/components/ChatWidget.jsx
import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import ChatLauncher from "./ChatLauncher";
import ChatDock from "./ChatDock";

export default function ChatWidget({ disabled = false }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const close = () => setOpen(false);
  const toggle = () => setOpen((v) => !v);

  return (
    <>
      <ChatLauncher
        open={open}
        onToggle={toggle}
        disabled={disabled}
      />

      {mounted && open &&
        createPortal(
          <ChatDock onClose={close} />,
          document.body
        )}
    </>
  );
}
