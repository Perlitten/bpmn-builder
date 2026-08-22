import { useState } from 'react';
import { X } from 'lucide-react';
import mascotSprite from '../../assets/architect-mascot-sprite.webp';

const QUIPS = [
  'A useful process is one you can trust before opening the editor.',
  'Six processes, one preview. The list stays put while you compare.',
  'If a branch has no condition, the engine has to guess. Engines are bad at guessing.',
  'Describe the work in clauses. I will keep the notation out of your way.',
];

export function ListArchitectMascot() {
  const [open, setOpen] = useState(false);
  const [quip, setQuip] = useState(0);

  const next = () => {
    setQuip((current) => (current + 1) % QUIPS.length);
    setOpen(true);
  };

  return (
    <span className="list-architect">
      <button
        type="button"
        className="list-architect-trigger"
        aria-label="Architect mascot — show a remark"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span
          className="list-architect-sprite"
          aria-hidden="true"
          style={{ backgroundImage: `url(${mascotSprite})` }}
        />
      </button>
      {open ? (
        <span className="list-architect-popover" role="dialog" aria-label="Architect remark">
          <span className="list-architect-copy">
            <span>{QUIPS[quip]}</span>
            <button type="button" aria-label="Dismiss" onClick={() => setOpen(false)}>
              <X size={13} strokeWidth={1.75} aria-hidden="true" />
            </button>
          </span>
          <span className="list-architect-meta">
            <span>ARCHITECT · NOT A CHAT</span>
            <button type="button" onClick={next}>ANOTHER →</button>
          </span>
        </span>
      ) : null}
    </span>
  );
}
