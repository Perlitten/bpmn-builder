import type { MascotMood } from './mascotMood';
import { useMascotHello } from './mascotHello';
import mascotShadow from '../../../assets/architect-mascot-shadow.webp';
import mascotSprite from '../../../assets/architect-mascot-sprite.webp';

type ArchitectMascotProps = {
  mood: MascotMood;
  /** When the companion is only the robot (collapsed / first perch). */
  collapsed?: boolean;
};

/** Living Architect companion. The selected character artwork stays intact; motion is CSS. */
export function ArchitectMascot({ mood, collapsed = true }: ArchitectMascotProps) {
  const hello = useMascotHello(mood);

  return (
    <span className="architect-mascot-wrap">
      <span
        className={hello ? 'architect-mascot is-hello' : 'architect-mascot'}
        data-mood={mood}
        data-collapsed={collapsed || undefined}
        aria-hidden
      >
        <span
          className="architect-mascot-shadow"
          style={{ backgroundImage: `url(${mascotShadow})` }}
        />
        <span className="architect-mascot-float">
          <span
            className="architect-mascot-frame"
            style={{ backgroundImage: `url(${mascotSprite})` }}
          />
        </span>
      </span>
      <span className="architect-hello" aria-hidden>
        Hello
      </span>
    </span>
  );
}
