import { forwardRef, useImperativeHandle, useRef } from 'react';
import { BPMN_FILE_ACCEPT, readBpmnFile } from '../../lib/readBpmnFile';
import { Button } from '../ui/Button';

type ImportBpmnButtonProps = {
  disabled?: boolean;
  label?: string;
  variant?: 'primary' | 'accent' | 'ghost' | 'outline';
  onImport: (file: File, xml: string) => void;
  onError: (message: string) => void;
};

export type ImportBpmnButtonHandle = { open: () => void };

export const ImportBpmnButton = forwardRef<ImportBpmnButtonHandle, ImportBpmnButtonProps>(
  function ImportBpmnButton({ disabled, label = 'Import BPMN', variant = 'outline', onImport, onError }, ref) {
    const inputRef = useRef<HTMLInputElement>(null);
    useImperativeHandle(ref, () => ({ open: () => inputRef.current?.click() }));

    return (
      <>
        <Button variant={variant} size="sm" disabled={disabled} onClick={() => inputRef.current?.click()}>
          {label}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept={BPMN_FILE_ACCEPT}
          aria-hidden="true"
          tabIndex={-1}
          hidden
          disabled={disabled}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (!file) return;
            void readBpmnFile(file)
              .then((xml) => onImport(file, xml))
              .catch((err: unknown) => {
                onError(err instanceof Error ? err.message : 'Could not read file');
              });
          }}
        />
      </>
    );
  },
);
