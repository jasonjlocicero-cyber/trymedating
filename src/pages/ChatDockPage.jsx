// src/pages/ChatDockPage.jsx
import React from "react";
import { useParams } from "react-router-dom";
import ChatDock from "../components/ChatDock";
import MessagesPanel from "../components/MessagesPanel"; // ← NEW

export default function ChatDockPage() {
  const { peerId } = useParams();
  if (!peerId) return <div className="p-4 text-sm">Missing peerId.</div>;

  return (
    <ChatDock
      peerId={peerId}
      renderMessages={(connectionId) => (
        <MessagesPanel connectionId={connectionId} />
      )}
    />
  );
}
