
// Frontend UX: five assistant states, travel suggestions, live captions and microphone recording.
const stateLabel = document.getElementById('assistant-state');
const stateDetail = document.getElementById('assistant-state-detail');
const stateDot = document.getElementById('assistant-state-dot');
const caption = document.getElementById('live-caption-text');
const captionLabel = document.getElementById('caption-label');
const micButton = document.getElementById('mic-btn');
const micHint = document.getElementById('mic-hint');
const input = document.getElementById('speech-input');
const sendButton = document.getElementById('chat-btn');

function setAssistantState(state, detail) {
  const labels = {
    ready: ['Prête à discuter', 'Appuyez sur le micro pour commencer'],
    listening: ['Je vous écoute…', 'Parlez naturellement, je suis attentive'],
    thinking: ['Je réfléchis…', 'Je prépare votre réponse'],
    speaking: ['Je vous réponds', 'Vous pouvez m’interrompre à tout moment'],
    error: ['Un problème est survenu', 'Vous pouvez réessayer ou écrire votre question']
  };
  const value = labels[state] || labels.ready;
  stateLabel.textContent = value[0];
  stateDetail.textContent = detail || value[1];
  stateDot.dataset.state = state;
  document.body.dataset.assistantState = state;
}
function setCaption(text, label) {
  caption.textContent = text || '';
  captionLabel.textContent = label || 'SOUS-TITRES';
}
setAssistantState('ready');

document.querySelectorAll('.suggestion').forEach(button => {
  button.addEventListener('click', () => {
    input.value = button.dataset.prompt || '';
    input.dispatchEvent(new Event('input', {bubbles:true}));
    input.focus();
    sendButton.disabled = !input.value.trim();
  });
});
input.addEventListener('input', () => { sendButton.disabled = !input.value.trim(); });
input.addEventListener('keydown', event => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    if (!sendButton.disabled) sendButton.click();
  }
});

// Observe the existing text-chat button and backend response without changing the teammate's Three.js code.
sendButton.addEventListener('click', () => {
  const question = input.value.trim();
  if (!question) return;
  setAssistantState('thinking');
  setCaption(question, 'VOUS');
  const observer = new MutationObserver(() => {
    const answer = document.getElementById('speech-bubble-text')?.textContent?.trim();
    if (answer) {
      setAssistantState('speaking');
      setCaption(answer, 'ASSISTANTE');
      observer.disconnect();
      window.setTimeout(() => setAssistantState('ready'), 4500);
    }
  });
  observer.observe(document.getElementById('speech-bubble'), {childList:true, subtree:true, characterData:true, attributes:true});
  window.setTimeout(() => {
    if (document.body.dataset.assistantState === 'thinking') {
      setAssistantState('error', 'Aucune réponse reçue. Réessayez ou vérifiez le serveur.');
      observer.disconnect();
    }
  }, 18000);
});

let recorder = null;
let chunks = [];
let recordingStream = null;
micButton.addEventListener('click', async () => {
  if (recorder && recorder.state === 'recording') {
    recorder.stop();
    return;
  }
  try {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      throw new Error('La capture audio n’est pas prise en charge par ce navigateur.');
    }
    recordingStream = await navigator.mediaDevices.getUserMedia({audio:true});
    chunks = [];
    const preferred = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
    const mimeType = preferred.find(type => MediaRecorder.isTypeSupported(type));
    recorder = new MediaRecorder(recordingStream, mimeType ? {mimeType} : undefined);
    recorder.addEventListener('dataavailable', event => { if (event.data.size) chunks.push(event.data); });
    recorder.addEventListener('stop', async () => {
      micButton.classList.remove('recording');
      micHint.textContent = 'Traitement de votre demande…';
      setAssistantState('thinking');
      const blob = new Blob(chunks, {type: recorder.mimeType || 'audio/webm'});
      recordingStream?.getTracks().forEach(track => track.stop());
      const reader = new FileReader();
      reader.onloadend = async () => {
        try {
          const base64 = String(reader.result).split(',')[1];
          const format = (recorder.mimeType || 'audio/webm').includes('ogg') ? 'ogg' :
                         (recorder.mimeType || '').includes('wav') ? 'wav' : 'webm';
          const response = await fetch('/api/audio-chat', {
            method:'POST', headers:{'Content-Type':'application/json'},
            body:JSON.stringify({audio_base64:base64, audio_format:format, use_server_tts:true})
          });
          if (!response.ok) throw new Error('Le serveur vocal a répondu avec une erreur.');
          const data = await response.json();
          if (data.reply_text) {
            setCaption(data.reply_text, 'ASSISTANTE');
            setAssistantState('speaking');
            if (data.audio_url) {
              const audio = new Audio(data.audio_url);
              audio.play().catch(()=>{});
              audio.addEventListener('ended', () => setAssistantState('ready'), {once:true});
            } else {
              window.setTimeout(() => setAssistantState('ready'), 4000);
            }
          } else throw new Error('Réponse vocale vide.');
        } catch (error) {
          setAssistantState('error', error.message || 'Impossible de traiter votre voix.');
          setCaption('Je n’ai pas pu traiter votre demande. Vous pouvez réessayer ou écrire votre question.');
        } finally {
          micHint.textContent = 'Appuyez pour parler';
        }
      };
      reader.readAsDataURL(blob);
    }, {once:true});
    recorder.start();
    micButton.classList.add('recording');
    micHint.textContent = 'Enregistrement… appuyez pour terminer';
    setAssistantState('listening');
    setCaption('Je vous écoute…', 'VOUS');
  } catch (error) {
    setAssistantState('error', error.message || 'Autorisez l’accès au microphone pour parler.');
    micHint.textContent = 'Microphone indisponible';
  }
});
