import { useEffect, useId, useRef, useState } from "react";
import { chooseVoice, hasLocalVoice } from "./listenModel";

/* ================================================================
   VERDIO — Listen button
   Reads text aloud with the browser's own speech engine
   (window.speechSynthesis). Nothing is sent anywhere and nothing is
   spoken until the button is pressed. Only voices that run on this
   device are used, and the button is not drawn at all when the
   browser has no speech or only network voices.
   ================================================================ */

function getSpeech(): SpeechSynthesis | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') return null;
  return window.speechSynthesis;
}

/** What the button is for, e.g. "the Monday brief": it finishes "Listen to ..." in the accessible name. */
export function ListenButton({ utterances, subject }: { utterances: string[]; subject: string }) {
  const [speech] = useState(getSpeech);
  const [usable, setUsable] = useState(() => !speech || hasLocalVoice(speech.getVoices()));
  const [speaking, setSpeaking] = useState(false);
  const counter = useRef(0);
  const active = useRef(0);
  const hintId = useId();
  const content = utterances.join('\n');

  useEffect(() => {
    if (!speech) return;
    const refresh = () => setUsable(hasLocalVoice(speech.getVoices()));
    speech.addEventListener?.('voiceschanged', refresh);
    return () => speech.removeEventListener?.('voiceschanged', refresh);
  }, [speech]);

  // Stops when the page changes (unmount), when the story changes, or when the tab is left.
  useEffect(() => {
    if (!speech) return;
    const stop = () => {
      if (active.current === 0) return;
      active.current = 0;
      speech.cancel();
      setSpeaking(false);
    };
    window.addEventListener('pagehide', stop);
    return () => { window.removeEventListener('pagehide', stop); stop(); };
  }, [speech, content]);

  if (!speech || !usable || utterances.length === 0) return null;

  function toggle() {
    if (!speech) return;
    if (speaking) {
      active.current = 0;
      speech.cancel();
      setSpeaking(false);
      return;
    }
    const id = ++counter.current;
    active.current = id;
    try {
      speech.cancel();
      const preferred = [document.documentElement.lang, navigator.language].filter(Boolean);
      const voice = chooseVoice(speech.getVoices(), preferred);
      const lastIndex = utterances.length - 1;
      utterances.forEach((text, index) => {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = voice?.lang ?? preferred[0] ?? 'en';
        if (voice) utterance.voice = voice;
        if (index === lastIndex) {
          const done = () => { if (active.current === id) { active.current = 0; setSpeaking(false); } };
          utterance.onend = done;
          utterance.onerror = done;
        }
        speech.speak(utterance);
      });
    } catch {
      active.current = 0;
      speech.cancel();
      return;
    }
    setSpeaking(true);
  }

  return (
    <div className="v2-ls">
      <button type="button" className="v2-ls-btn" aria-pressed={speaking} aria-describedby={hintId} onClick={toggle}>
        {speaking ? <>Stop<span className="sr-only"> reading {subject}</span></> : <>Listen<span className="sr-only"> to {subject}</span></>}
      </button>
      <span id={hintId} className="v2-tag v2-ls-hint">Read aloud by your browser. Nothing is sent anywhere.</span>
    </div>
  );
}
