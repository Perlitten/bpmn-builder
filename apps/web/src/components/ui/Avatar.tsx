import { useState } from 'react';

type AvatarProps = {
  name: string;
  src?: string | null;
};

export function Avatar({ name, src }: AvatarProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || '?';
  const showImage = Boolean(src && failedSrc !== src);

  return (
    <span className="ui-avatar" aria-hidden="true">
      {showImage ? (
        <img
          src={src ?? undefined}
          alt=""
          referrerPolicy="no-referrer"
          onError={() => setFailedSrc(src ?? null)}
        />
      ) : initials}
    </span>
  );
}
