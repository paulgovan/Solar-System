// Feature: measure tool. Pick two bodies; a line and a live label show the real distance
// (AU, km, light time). See src/ui/measure.js.

import { initMeasure } from '../ui/measure.js';

export default {
  id: 'measure',
  setup(app) {
    this.tool = initMeasure(app);
  },
  update() {
    this.tool.update();
  },
};
