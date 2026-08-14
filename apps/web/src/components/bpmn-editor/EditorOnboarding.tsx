import { EDITOR_ONBOARDING_COPY, writeEditorOnboardingSeen } from './onboardingStorage';

type EditorOnboardingProps = {
  onDismiss: () => void;
};

export function EditorOnboarding({ onDismiss }: EditorOnboardingProps) {
  return (
    <div className="editor-onboarding" role="status">
      <p>{EDITOR_ONBOARDING_COPY}</p>
      <button
        type="button"
        className="editor-onboarding-dismiss"
        onClick={() => {
          writeEditorOnboardingSeen();
          onDismiss();
        }}
      >
        Dismiss
      </button>
    </div>
  );
}
