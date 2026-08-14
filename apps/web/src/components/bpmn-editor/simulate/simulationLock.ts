export const simulationLock = { on: false };

type EventBus = {
  on: (event: string, priority: number, cb: () => unknown) => void;
};

const BLOCKED = [
  'shape.move',
  'elements.move',
  'shape.create',
  'elements.create',
  'connection.create',
  'connection.reconnect',
  'shape.delete',
  'elements.delete',
  'shape.replace',
  'element.updateLabel',
  'label.create',
];

function SimulationLockRules(eventBus: EventBus) {
  for (const command of BLOCKED) {
    eventBus.on(`commandStack.${command}.canExecute`, 6000, () => {
      if (simulationLock.on) return false;
    });
  }
}

SimulationLockRules.$inject = ['eventBus'];

export const simulationLockModule = {
  __init__: ['simulationLockRules'],
  simulationLockRules: ['type', SimulationLockRules],
};
