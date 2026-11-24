/**
 * ChatPage.jsx — "AI Assistant" in the Figma layout.
 * Same features as before: saved conversations, auto-titles, voice logging, AI status.
 */
import { useState, useEffect, useRef } from 'react'
import { api, aiApi } from './api'
import { Icon, Heading } from './ui'

const SUGGESTIONS = [
  'Why are my marks dropping?',
  'Am I okay for placements?',
  'What should I focus on this week?',
  'Is my attendance safe?',
  'Where am I spending the most?',
]

export default function ChatPage() {
  const [sessions, setSessions] = useState([])
  const [activeId, setActiveId] = useState(null)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [recording, setRecording] = useState(false)
  const [aiStatus, setAiStatus] = useState(null)
  const bottomRef = useRef(null)
  const mediaRef = useRef(null)
  const chunksRef = useRef([])

  useEffect(() => { loadSessions(); aiApi.status().then(setAiStatus).catch(() => {}) }, [])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, loading])

  const loadSessions = async () => setSessions(await api.getChatSessions().catch(() => []))
  const loadSession = async (id) => { setActiveId(id); setMessages(await api.getChatMessages(id).catch(() => [])) }
  const newChat = () => { setActiveId(null); setMessages([]); setInput('') }

  const send = async () => {
    const q = input.trim()
    if (!q || loading) return
    setMessages(prev => [...prev, { role: 'user', content: q, created_at: new Date().toISOString() }])
    setInput(''); setLoading(true)
    try {
      let sessionId = activeId
      if (!sessionId) {
        const session = await api.createChatSession(q.slice(0, 60))
        sessionId = session.id; setActiveId(sessionId); loadSessions()
      }
      const res = await api.sendChatMessage(sessionId, q)
      setMessages(prev => [...prev, { role: 'assistant', content: res.answer || 'Something went wrong.', tokens: res.tokens_used, created_at: new Date().toISOString(), error: res.error }])
      loadSessions()
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Could not reach backend. Is uvicorn running?', created_at: new Date().toISOString(), error: 'connection_failed' }])
    }
    setLoading(false)
  }

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const media = new MediaRecorder(stream)
      mediaRef.current = media; chunksRef.current = []
      media.ondataavailable = e => chunksRef.current.push(e.data)
      media.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        stream.getTracks().forEach(t => t.stop())
        const res = await aiApi.voiceLog(blob)
        if (res.success && res.logged?.length > 0) {
          setMessages(prev => [...prev, { role: 'voice', content: `“${res.text}”`, logged: res.logged, created_at: new Date().toISOString() }])
        } else {
          setMessages(prev => [...prev, { role: 'voice', content: res.text || 'Could not understand audio.', created_at: new Date().toISOString(), error: res.error }])
        }
      }
      media.start(); setRecording(true)
    } catch { alert('Microphone access denied.') }
  }
  const stopRecording = () => { mediaRef.current?.stop(); setRecording(false) }

  const deleteSession = async (id, e) => {
    e.stopPropagation()
    await api.deleteChatSession(id)
    if (activeId === id) newChat()
    loadSessions()
  }

  const fmt = (iso) => {
    const d = new Date(iso), now = new Date()
    if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
  }

  const activeTitle = activeId ? (sessions.find(s => s.id === activeId)?.title || 'Conversation') : null

  return (
    <div className="assistant-page">
      <aside className="chat-history">
        <span>CONVERSATIONS</span>
        <button className="new-chat" onClick={newChat}><Icon name="sparkles" size={16} /> New conversation</button>
        <small>RECENT</small>
        <div className="list">
          {sessions.length === 0 && <div className="none">No chats yet</div>}
          {sessions.map(s => (
            <div key={s.id} role="button" tabIndex={0} className={`sess ${activeId === s.id ? 'active' : ''}`}
              onClick={() => loadSession(s.id)} onKeyDown={e => e.key === 'Enter' && loadSession(s.id)}>
              <div className="st"><b>{s.title || 'New chat'}</b><small>{fmt(s.updated_at || s.created_at)}</small></div>
              <button className="x" aria-label="Delete conversation" onClick={e => deleteSession(s.id, e)}><Icon name="x" size={14} /></button>
            </div>
          ))}
        </div>
      </aside>

      <section className="chat-main">
        <Heading eyebrow="AI Assistant" title={activeTitle || 'Think better, with context.'}
          description="Ask about your attendance, marks, habits, spending and goals — JARVIS reads your real data."
          action={
            <div className="status-row">
              {aiStatus && <span className={`badge ${aiStatus.claude?.available ? 'ok' : 'mid'}`}>{aiStatus.claude?.available ? '● Gemini connected' : '○ No AI key'}</span>}
              {aiStatus?.whisper?.available && <span className="badge ok">● Voice</span>}
              <button className="outline-action" onClick={newChat}><Icon name="plus" size={15} /> New</button>
            </div>
          } />

        <div className="chat-thread">
          {messages.length === 0 && (
            <div className="chat-intro">
              <div className="empty-icon"><Icon name="sparkles" size={22} /></div>
              <b>Ask anything about your data</b>
              <p>JARVIS reads your real attendance, marks, streaks and expenses to give a specific answer.</p>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`message ${m.role === 'user' ? 'user' : 'jarvis'} ${m.error ? 'err' : ''}`}>
              {m.role !== 'user' && <div className={`jarvis-avatar ${m.role === 'voice' ? 'voice' : ''}`}><Icon name={m.role === 'voice' ? 'mic' : 'sparkles'} size={15} /></div>}
              <div>
                <span>{m.role === 'user' ? 'YOU' : m.role === 'voice' ? 'VOICE LOG' : 'JARVIS'}</span>
                <p>{m.content}</p>
                {m.logged?.map((l, j) => <div className="logged" key={j}>✓ {l}</div>)}
                <div className="meta"><span>{fmt(m.created_at)}</span>{m.tokens && <span>{m.tokens} tokens</span>}</div>
              </div>
            </div>
          ))}
          {loading && (
            <div className="message jarvis">
              <div className="jarvis-avatar"><Icon name="sparkles" size={15} /></div>
              <div><span>JARVIS</span><p><span className="typing"><i /><i /><i /></span></p></div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="suggested-prompts">
          <span>TRY ASKING</span>
          <div>{SUGGESTIONS.map(s => <button key={s} onClick={() => setInput(s)}>{s}</button>)}</div>
        </div>

        <div className="chat-composer">
          <textarea
            value={input} disabled={recording}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
            placeholder={recording ? 'Recording… tap ■ to stop' : 'Ask JARVIS anything...'} />
          <button className={`voice ${recording ? 'rec' : ''}`} onClick={recording ? stopRecording : startRecording}
            aria-label={recording ? 'Stop recording' : 'Voice log'} title={recording ? 'Stop recording' : 'Voice log'}>
            <Icon name={recording ? 'stop' : 'mic'} />
          </button>
          <button className="send" onClick={send} disabled={!input.trim() || loading || recording} aria-label="Send"><Icon name="send" size={18} /></button>
          <small>Tap the mic to log by voice — “I attended DBMS today” or “scored 72 in maths quiz”.</small>
        </div>
      </section>
    </div>
  )
}
