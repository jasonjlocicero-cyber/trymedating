// src/chat/ChatContext.jsx
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from 'react'
import { supabase } from '../lib/supabaseClient'
import ChatDock from '../components/ChatDock'

/**
 * ChatContext
 * Lightweight global chat controller so ANY page/component can open a 1:1 chat.
 *
 * IMPORTANT:
 * - In your current setup you use <ChatProvider renderDock={false}> and ChatLauncher owns the dock.
 * - This file now forwards openChat() to ChatLauncher via window.openChat OR the 'open-chat' event.
 * - It also listens for both:
 *     - 'tryme:open-chat' (new / preferred)
 *     - 'open-chat' (legacy / used by existing code)
 */

const ChatCtx = createContext({
  openChat: (_id, _name) => {},
  closeChat: () => {},
  me: null,
  isOpen: false, // only meaningful when renderDock=true
  partner: { id: null, name: '' },
  unreadBump: 0
})

export function ChatProvider({ children, renderDock = false }) {
  // ---- Auth → me (lightweight) ----
  const [me, setMe] = useState(null)

  useEffect(() => {
    let unsub
    ;(async () => {
      const { data: { user } = {} } = await supabase.auth.getUser()
      setMe(user ? { id: user.id, name: user.user_metadata?.full_name || user.email } : null)
    })()

    const sub = supabase.auth.onAuthStateChange((_evt, session) => {
      const u = session?.user
      setMe(u ? { id: u.id, name: u.user_metadata?.full_name || u.email } : null)
    })

    unsub = sub?.data?.subscription
    return () => unsub?.unsubscribe?.()
  }, [])

  // ---- Provider-owned dock state (ONLY if renderDock=true) ----
  const [isOpen, setOpen] = useState(false)
  const [partner, setPartner] = useState({ id: null, name: '' })

  // Optional unread bump (badges/etc. if you wire it up)
  const [unreadBump, setUnreadBump] = useState(0)
  const onUnreadChange = useCallback(() => setUnreadBump((n) => n + 1), [])

  /**
   * Bubble-only open:
   * - Always updates context partner (useful for UI/telemetry)
   * - If renderDock=true, opens the provider-rendered dock
   * - Otherwise forwards to ChatLauncher via window.openChat or 'open-chat' event
   */
  const openChat = useCallback(
    (partnerId, partnerName = '') => {
      if (!partnerId) return

      setPartner({ id: partnerId, name: partnerName || '' })

      if (renderDock) {
        setOpen(true)
        return
      }

      // Forward to ChatLauncher (preferred)
      if (typeof window.openChat === 'function') {
        window.openChat(partnerId, partnerName || '')
        return
      }

      // Legacy event fallback (ChatLauncher listens to this)
      window.dispatchEvent(
        new CustomEvent('open-chat', {
          detail: { partnerId, partnerName: partnerName || '' }
        })
      )
    },
    [renderDock]
  )

  const closeChat = useCallback(() => {
    if (renderDock) setOpen(false)
    // (Optional) could emit a close event if you ever want ChatLauncher to react
    // window.dispatchEvent(new CustomEvent('close-chat'))
  }, [renderDock])

  // Global event open (no imports) — support BOTH new + legacy names
  useEffect(() => {
    const onOpen = (e) => {
      const { partnerId, partnerName = '' } = e?.detail || {}
      if (partnerId) openChat(partnerId, partnerName)
    }
    window.addEventListener('tryme:open-chat', onOpen)
    window.addEventListener('open-chat', onOpen) // legacy compatibility
    return () => {
      window.removeEventListener('tryme:open-chat', onOpen)
      window.removeEventListener('open-chat', onOpen)
    }
  }, [openChat])

  const value = useMemo(
    () => ({ openChat, closeChat, me, isOpen, partner, unreadBump }),
    [openChat, closeChat, me, isOpen, partner, unreadBump]
  )

  return (
    <ChatCtx.Provider value={value}>
      {children}

      {/* Optional: Provider renders the dock itself (only if you set renderDock=true). */}
      {renderDock && isOpen && partner?.id && (
        <div
          style={{
            position: 'fixed',
            right: 16,
            bottom: 80,
            width: 360,
            height: 480,
            maxWidth: 'calc(100vw - 24px)',
            zIndex: 1002
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
            <button
              type="button"
              onClick={closeChat}
              className="btn btn-neutral"
              style={{ padding: '4px 10px' }}
              aria-label="Close chat"
              title="Close"
            >
              ✕
            </button>
          </div>

          <div style={{ height: 'calc(100% - 36px)' }}>
            <ChatDock partnerId={partner.id} mode="widget" />
          </div>
        </div>
      )}
    </ChatCtx.Provider>
  )
}

export function useChat() {
  return useContext(ChatCtx)
}

/**
 * Convenience button so you don’t have to wire onClick everywhere.
 */
export function ChatButton({
  partnerId,
  partnerName = '',
  children = 'Message',
  onClick,
  ...props
}) {
  const { openChat } = useChat()
  return (
    <button
      {...props}
      onClick={(e) => {
        onClick?.(e)
        openChat(partnerId, partnerName)
      }}
    >
      {children}
    </button>
  )
}

