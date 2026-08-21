type ModeBarProps = {
  mode: string;
  detail: string;
  meta?: string;
};

export function ModeBar({ mode, detail, meta }: ModeBarProps) {
  return (
    <div className="ui-mode-bar" aria-label={`${mode}: ${detail}`}>
      <strong>{mode}</strong>
      <span>{detail}</span>
      {meta ? <span className="ui-mode-bar-meta">{meta}</span> : null}
    </div>
  );
}
