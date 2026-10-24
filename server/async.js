const wrap = (fn) => (fn.length >= 4 ? fn : (req, res, next) => {
  try { const r = fn(req, res, next); if (r && typeof r.catch === 'function') r.catch(next); } catch (e) { next(e); }
});

function asyncRoutes(router) {
  for (const m of ['get', 'post', 'put', 'patch', 'delete', 'use', 'all']) {
    const orig = router[m].bind(router);
    router[m] = (...args) => orig(...args.map((a) => (typeof a === 'function' && !a.handle && !a.stack ? wrap(a) : a)));
  }
  return router;
}

module.exports = { asyncRoutes };
