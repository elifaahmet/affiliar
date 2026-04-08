export const eventBuffer: Record<string, boolean> = {};

export const markEvent = (eventName: string) => {
  eventBuffer[eventName] = true;
};

export const clearEvent = (eventName: string) => {
  eventBuffer[eventName] = false;
};

export const isEventMarked = (eventName: string): boolean => {
  return !!eventBuffer[eventName];
};
