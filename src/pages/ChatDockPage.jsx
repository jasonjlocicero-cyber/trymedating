import React from "react";
import { useParams } from "react-router-dom";
import ChatDock from "../components/ChatDock";

export default function ChatDockPage() {
  const { peerId } = useParams();
  if (!peerId) return <div className="p-4 text-sm">Missing peerId.</div>;
  return <ChatDock peerId={peerId} />;
}
