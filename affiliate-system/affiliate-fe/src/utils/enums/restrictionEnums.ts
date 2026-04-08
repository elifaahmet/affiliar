export enum RestrictionType {
  PROVIDER = 'provider',
  GAME = 'game',
}

export const RESTRICTION_ICONS = {
  [RestrictionType.PROVIDER]: 'providerChip',
  [RestrictionType.GAME]: 'cherryChip',
};

export const RESTRICTION_LABELS = {
  [RestrictionType.PROVIDER]: 'Provider',
  [RestrictionType.GAME]: 'Game',
};
