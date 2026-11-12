// Feature: events drawer (famous moments + computed oppositions, conjunctions, elongations
// and eclipses). See src/ui/events.js; the maths is in src/ephemeris/conjunctions.js.

import { initEventsDrawer } from '../ui/events.js';

export default {
  id: 'events',
  setup(app) {
    initEventsDrawer(app);
  },
};
