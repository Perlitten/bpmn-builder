import { editorOnboardingCopy, writeEditorOnboardingSeen } from './onboardingStorage';

type EditorOnboardingProps = {
  compact: boolean;
  onDismiss: () => void;
};

export function EditorOnboarding({ compact, onDismiss }: EditorOnboardingProps) {
  return (
    <div className="editor-onboarding" role="status">
      <p>{editorOnboardingCopy(compact)}</p>
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
