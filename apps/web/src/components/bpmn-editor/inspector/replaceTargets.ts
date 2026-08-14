import {
  AD_HOC_SUBPROCESS_EXPANDED,
  BOUNDARY_EVENT,
  DATA_OBJECT_REFERENCE,
  DATA_STORE_REFERENCE,
  END_EVENT,
  EVENT_SUB_PROCESS,
  EVENT_SUB_PROCESS_START_EVENT,
  GATEWAY,
  INTERMEDIATE_EVENT,
  PARTICIPANT,
  START_EVENT,
  START_EVENT_SUB_PROCESS,
  SUBPROCESS_EXPANDED,
  TASK,
  TRANSACTION,
} from 'bpmn-js/lib/features/replace/ReplaceOptions';
import type { BpmnComponentDefinition } from '@bpmn/semantic-core';
import { findMatchingReplaceTarget, type ReplaceTargetShape } from './inspectorModel';

const BPMN_JS_TARGETS: ReplaceTargetShape[] = [
  START_EVENT,
  START_EVENT_SUB_PROCESS,
  INTERMEDIATE_EVENT,
  END_EVENT,
  GATEWAY,
  TASK,
  BOUNDARY_EVENT,
  SUBPROCESS_EXPANDED,
  AD_HOC_SUBPROCESS_EXPANDED,
  TRANSACTION,
  EVENT_SUB_PROCESS,
  EVENT_SUB_PROCESS_START_EVENT,
  DATA_OBJECT_REFERENCE,
  DATA_STORE_REFERENCE,
  PARTICIPANT,
].flatMap((group) => group.flatMap((option) => (option.target ? [option.target as ReplaceTargetShape] : [])));

export function bpmnJsReplacePayload(def: BpmnComponentDefinition): ReplaceTargetShape | undefined {
  return findMatchingReplaceTarget(def, BPMN_JS_TARGETS);
}
