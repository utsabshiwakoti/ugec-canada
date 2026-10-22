const initial = () => ({ ref: null, sProv: 'All', sCat: 'All', view: 'cards', bannerOff: false, bookType: 'educational', bookPre: null });

export const S = { site: null, programs: [], posts: null, ...initial() };

export const resetState = () => Object.assign(S, initial());
