export enum GAME_CATEGORY_TABS {
  CATEGORIES = 'categories',
  MULTI_CATEGORY = 'multi-category-games',
}

export const GAME_CATEGORY_TAB_LABELS: Record<GAME_CATEGORY_TABS, string> = {
  [GAME_CATEGORY_TABS.CATEGORIES]: 'Categories',
  [GAME_CATEGORY_TABS.MULTI_CATEGORY]: 'Multi-Category Games',
};
