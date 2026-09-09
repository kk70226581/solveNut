import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import VideoCall from '../../src/components/VideoCall';
import '../../src/index.css';
import '../../src/styles/ClientChat.css';
import '../../src/styles/ExpertDashboard.css';
import '../../src/styles/workspace.css';

const role = new URLSearchParams(location.search).get('role') || 'client';
const email = `${role}@example.com`;
const handlers = new Map();
const socket = {
  connected: true,
  on(event, handler) { if (!handlers.has(event)) handlers.set(event, new Set()); handlers.get(event).add(handler); },
  off(event, handler) { handlers.get(event)?.delete(handler); },
  receive(event, data) { handlers.get(event)?.forEach(handler => handler(data)); },
  emit(event, data) {
    if (event === 'join-room') queueMicrotask(() => socket.receive('room_joined', data));
    else window.relaySignal?.({ event, data: { ...data, from: email, fromName: role } });
  },
};
window.testSocket = socket;

export function Harness() {
  const [active, setActive] = useState(false);
  return <div className={role === 'client' ? 'client-chat-page' : 'ed-page'}>
    <button data-testid="background-action" style={{ position: 'fixed', bottom: 10, left: 10 }} onClick={event => { event.currentTarget.textContent = 'Workspace available'; }}>Workspace action</button>
    <div className={`${role === 'client' ? 'chat-call-launcher' : 'ed-chat-call-launcher'} ${active ? 'is-open' : ''}`}>
      <VideoCall socket={socket} roomId="client@example.com_expert@example.com" currentUserEmail={email}
        peerLabel={role === 'client' ? 'Expert' : 'Client'} compact onCallStateChange={state => setActive(state.active)} />
    </div>
  </div>;
}
createRoot(document.getElementById('root')).render(<Harness />);
