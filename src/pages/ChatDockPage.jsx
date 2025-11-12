// src/components/ChatDock.jsx
import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { supabase } from "../lib/supabaseClient";
import AttachmentButton from "./AttachmentButton";
import { uploadChatFile, signedUrlForPath } from "../lib/chatMedia";

/* ------------------------ helpers & constants ------------------------ */
const ACCEPTED = new Set(["accepted", "connected", "approved"]);
const CONN_TABLE = "connections";
const C = {
  requester: "requester_id",
  addressee: "addressee_id",
  status: "status",
  createdAt: "created_at",
  updatedAt: "updated_at",
};
const toId = (v) => (typeof v === "string" ? v : v?.id ? String(v.id) : v ? String(v) : "");
const otherPartyId = (row, my) =>
  row?.[C.requester] === my ? row?.[C.addressee] : row?.[C.requester];
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10MB
const ALLOWED = /^(image\/.*|application\/pdf)$/; // allowed attachments
const bannerKey = (myId, peer) => `tmd_prev_sessions_banner_hidden:${myId || ""}:${peer || ""}`;

/* open/close tokens built programmatically to avoid parser tripping on [[...]] */
const OPEN = "[".repeat(2);     // "[["
const CLOSE = "]".repeat(2);    // "]]"
const tagStart = (t) => OPEN + t + ":"; // e.g. "[[file:"
const betweenTags = (body, t) =>
  body.slice(tagStart(t).length, -CLOSE.length);

/* ---------- human-readable file size ---------- */
function humanSize(bytes) {
  if (!(bytes > 0)) return "";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  const fixed = n >= 100 || i === 0 ? 0 : 1;
  return `${n.toFixed(fixed)} ${units[i]}`;
}

/* ---------------- message body encodings & parsing ---------------- */
const isDeletedAttachment = (b) => typeof b === "string" && b.startsWith(tagStart("deleted"));
const parseDeleted = (b) => {
  try {
    return JSON.parse(decodeURIComponent(b.slice(tagStart("deleted").length, -CLOSE.length)));
  } catch {
    return null;
  }
};

/* NEW: tombstone for whole messages (set by RPC). Body equals "[[deletedmsg]]". */
const isDeletedMessage = (b) => typeof b === "string" && b.startsWith(OPEN + "deletedmsg" + CLOSE);

/** Normalize various historical/legacy attachment formats into a common meta */
function getAttachmentMeta(body) {
  if (typeof body !== "string") return null;

  // Canonical: [[file:<json>]]
  if (body.startsWith(tagStart("file"))) {
    try {
      return JSON.parse(decodeURIComponent(betweenTags(body, "file")));
    } catch {}
  }

  // Legacy A: [[media:<json>]]
  if (body.startsWith(tagStart("media"))) {
    try {
      const v = JSON.parse(decodeURIComponent(betweenTags(body, "media")));
      return {
        name: v.name || v.filename || v.path?.split("/")?.pop(),
        type: v.type || v.mime,
        size: v.size || v.bytes,
        path: v.path || undefined,
        url: v.url || undefined,
      };
    } catch {}
  }

  // Legacy B: [[image:<url>]] or [[img:<url>]]
  if (body.startsWith(tagStart("image")) || body.startsWith(tagStart("img"))) {
    const which = body.startsWith(tagStart("image")) ? "image" : "img";
    const raw = decodeURIComponent(betweenTags(body, which));
    if (raw.startsWith("http")) {
      return { url: raw, name: raw.split("/").pop(), type: "image/*" };
    }
  }

  // Legacy C: [[filepath:<storage-relative-path>]]
  if (body.startsWith(tagStart("filepath"))) {
    const p = decodeURIComponent(betweenTags(body, "filepath"));
    return { path: p, name: p.split("/").pop() };
  }

  // Legacy D: direct public storage URL in plain text
  const urlMatch = body.match(
    /https?:\/\/[^\s]+\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/([^\s\]]+)/
  );
  if (urlMatch) {
    const url = body.trim();
    const bucket = urlMatch[1];
    const path = urlMatch[2].replace(/\]+$/, "");
    return { url, path, bucket, name: path.split("/").pop() };
  }

  return null;
}

/* ----------------------------- linkifying ---------------------------- */
function linkifyJSX(text) {
  if (!text) return null;
  const LINK_RE =
    /((https?:\/\/|www\.)[^\s<]+)|([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[A-Za-z]{2,})/gi;
  const out = [];
  let last = 0,
    m,
    key =






