// Feature: the sky from Earth — the observer panel ("Tonight") and the ground view.
import { initObserverPanel } from '../ui/observer.js';

export default {
  id: 'skyView',

  setup(app) {
    app.skyView = { active: false, toggle() {}, lookAt() {} };
    this.panel = initObserverPanel(app);
  },

  update(app, dt) {
    this.panel?.update(dt);
  },
};
