// Feature: scale bar (true scale) / "not to scale" note (compressed). See src/ui/scaleBar.js.

import { initScaleBar } from '../ui/scaleBar.js';

export default {
  id: 'scaleBar',
  setup(app) {
    this.update_ = initScaleBar(app);
  },
  update() {
    this.update_();
  },
};
