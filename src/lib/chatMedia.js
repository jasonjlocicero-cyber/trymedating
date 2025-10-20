// src/lib/chatMedia.js
import { supabase } from "../lib/supabaseClient";

/**
 * Upload a file to the private 'chat-media' bucket at:
 *   <connectionId>/<timestamp>-<safe-filename>
 * Returns: { path, signedUrl }
 */
export async function uploadChatFile(connectionId, file) {
  if (!connectionId || !file) throw new Error("Missing connectionId or file");
  const safeName = `${Date.now()}-${file.name}`.replace(/[^\w.\-]+/g, "_");
  const path = `${connectionId}/${safeName}`;

  const { error: upErr } = await supabase
    .storage
    .from("chat-media")
    .upload(path, file, { contentType: file.type });
  if (upErr) throw upErr;

  const { data: signed, error: urlErr } = await supabase
    .storage
    .from("chat-media")
    .createSignedUrl(path, 60 * 60); // 1 hour
  if (urlErr) throw urlErr;

  return { path, signedUrl: signed?.signedUrl };
}

/** Get a fresh signed URL to render/download later. */
export async function signedUrlForPath(path, expiresIn = 3600) {
  const { data, error } = await supabase
    .storage
    .from("chat-media")
    .createSignedUrl(path, expiresIn);
  if (error) throw error;
  return data?.signedUrl;
}
