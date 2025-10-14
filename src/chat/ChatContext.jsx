// src/chat/ChatContext.jsx
import React, {
  createContext,
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
 * Usage:
 *   1) Wrap your app once:
 *        <ChatProvider renderDock={false}>{...}</ChatProvider>
 *      - renderDock=false keeps using your existing ChatLauncher-owned dock.
 *      - Set renderDock=true if you want this provider to render the dock itself.
 *
 *   2) Open chat from anywhere:
 *        const { openChat } = useChat()
 *        openChat(partnerId, partnerName)
 *
 *   3) Or use the ready-made <ChatButton partnerId="..." partnerName="...">Message</ChatButton>
 *
 *   4) Optionally, trigger via a global event (no imports):
 *        window.dispatchEvent(new CustomEvent('tryme:open-chat', {
 *          detail: { partnerId: 'uuid', partnerName: 'Alex' }
 *        }))
 */

const ChatCtx = createContext({
  openChat: (_id, _name) => {},
  closeChat: () => {},
  me: null,
  isOpen: false,
  partner: { id: null, name: '' },
})

export function ChatProvider({ children, renderDock = true }) {
  // ---- Auth → me ----
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

  // ---- ChatDock control ----
  const [isOpen, setOpen] = useState(false)
  const [partner, setPartner] = useState({ id: null, name: '' })

  const openChat = (partnerId, partnerName = '') => {
    if (!partnerId) return
    setPartner({ id: partnerId, name: partnerName })
    setOpen(true)
  }
  const closeChat = () => setOpen(false)

  // Optional: listen for global event to open chat without imports
  useEffect(() => {
    const onOpen = (e) => {
      const { partnerId, partnerName = '' } = e.detail || {}
      if (partnerId) openChat(partnerId, partnerName)
    }
    window.addEventListener('tryme:open-chat', onOpen)
    return () => window.removeEventListener('tryme:open-chat', onOpen)
  }, [])

  // Optional unread bump (for badges if you wire it up)
  const [unreadBump, setUnreadBump] = useState(0)
  const onUnreadChange = () => setUnreadBump((n) => n + 1)

  const value = useMemo(
    () => ({ openChat, closeChat, me, isOpen, partner, unreadBump }),
    [me, isOpen, partner, unreadBump]
  )

  return (
    <ChatCtx.Provider value={value}>
      {children}

      {/* If you want this provider to render the dock itself, keep renderDock=true.
          In your current setup we use <ChatProvider renderDock={false}> so
          your existing <ChatLauncher> remains in charge. */}
      {renderDock && isOpen && me && (
        <ChatDock
          me={me}
          partnerId={partner.id}
          partnerName={partner.name}
          onClose={closeChat}
          onUnreadChange={onUnreadChange}
        />
      )}
    </ChatCtx.Provider>
  )
}

export function useChat() {
  return useContext(ChatCtx)
}

/**
 * Convenience button so you don’t have to wire onClick everywhere.
 * Example:
 *   <ChatButton className="btn" partnerId={user.id} partnerName={user.display_name}>
 *     Message
 *   </ChatButton>
 */
export function ChatButton({ partnerId, partnerName = '', children = 'Message', onClick, ...props }) {
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
