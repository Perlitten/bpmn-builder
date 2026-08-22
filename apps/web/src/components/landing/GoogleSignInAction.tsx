type GoogleSignInActionProps = {
  configured: boolean | null;
  label?: string;
  className?: string;
};

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden className="shrink-0">
      <path fill="var(--color-google-blue)" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z" />
      <path fill="var(--color-google-green)" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.71H.96v2.33A9 9 0 0 0 9 18Z" />
      <path fill="var(--color-google-yellow)" d="M3.97 10.71A5.41 5.41 0 0 1 3.69 9c0-.59.1-1.17.28-1.71V4.96H.96A9 9 0 0 0 0 9c0 1.45.35 2.82.96 4.04l3.01-2.33Z" />
      <path fill="var(--color-google-red)" d="M9 3.58c1.32 0 2.5.45 3.44 1.34l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.96l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z" />
    </svg>
  );
}

export function GoogleSignInAction({
  configured,
  label = 'Continue with Google',
  className = '',
}: GoogleSignInActionProps) {
  const classes = `landing-action landing-action-paper w-full ${className}`;

  if (configured === true) {
    return (
      <a href="/api/auth/google" className={classes}>
        <GoogleMark />
        {label}
      </a>
    );
  }

  return (
    <span className={`${classes} cursor-not-allowed border-muted text-muted shadow-none`} aria-disabled="true">
      {configured === null ? 'Checking Google OAuth…' : label}
    </span>
  );
}
