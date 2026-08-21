type AvatarProps = {
  name: string;
};

export function Avatar({ name }: AvatarProps) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || '?';

  return (
    <span className="ui-avatar" aria-hidden="true">
      {initials}
    </span>
  );
}
